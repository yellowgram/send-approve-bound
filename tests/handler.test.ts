import { describe, it, expect, vi } from "vitest";
import { handleRequest } from "../src/proxy/handler.js";
import {
  ERR_APPROVE_DENIED,
  ERR_UNSIGNED_SEND_REFUSED,
  type SendApproveBoundConfig,
} from "../src/types.js";
import {
  SPENDER_OK,
  TOKEN_A,
  UNDECODABLE_RAW,
  encodeApprove,
  erc20Policy,
  signRaw,
  UINT256_MAX,
} from "./fixtures.js";

function cfg(
  opts: { enabled?: boolean; max?: bigint } = {}
): SendApproveBoundConfig {
  const policy = erc20Policy(TOKEN_A, opts.max ?? 1000n);
  if (opts.enabled === false) policy.enabled = false;
  return {
    listenHost: "127.0.0.1",
    listenPort: 8547,
    upstreamRpcUrl: "http://upstream.test",
    policy,
  };
}

describe("handler — DC13 (9)", () => {
  it("refuses eth_sendTransaction with -32081 and zero upstream calls", async () => {
    const forward = vi.fn();
    const res = await handleRequest(
      cfg(),
      { jsonrpc: "2.0", id: 1, method: "eth_sendTransaction", params: [{}] },
      { forward }
    );
    expect(res.error?.code).toBe(ERR_UNSIGNED_SEND_REFUSED);
    expect(forward).not.toHaveBeenCalled();
  });

  it("unparseable raw → -32085 tx_unparseable, zero upstream calls", async () => {
    const forward = vi.fn();
    const res = await handleRequest(
      cfg(),
      {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendRawTransaction",
        params: [UNDECODABLE_RAW],
      },
      { forward }
    );
    expect(res.error?.code).toBe(ERR_APPROVE_DENIED);
    expect((res.error?.data as { code?: string })?.code).toBe("tx_unparseable");
    expect((res.error?.data as { package?: string })?.package).toBe(
      "send-approve-bound"
    );
    expect(forward).not.toHaveBeenCalled();
  });

  it("allowed non-approval is forwarded once", async () => {
    const forward = vi.fn(async () => ({
      jsonrpc: "2.0" as const,
      id: 1,
      result: "0x" + "ab".repeat(32),
    }));
    const raw = await signRaw({
      to: TOKEN_A as `0x${string}`,
      data: ("0xa9059cbb" + "00".repeat(64)) as `0x${string}`,
    });
    const res = await handleRequest(
      cfg(),
      {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendRawTransaction",
        params: [raw],
      },
      { forward }
    );
    expect(res.error).toBeUndefined();
    expect(res.result).toMatch(/^0x/);
    expect(res.sendApproveBound?.decision).toBe("forward");
    expect(forward).toHaveBeenCalledOnce();
  });

  it("unlimited approve deny → -32085 approve_unbounded, not forwarded", async () => {
    const forward = vi.fn();
    const raw = await signRaw({
      to: TOKEN_A as `0x${string}`,
      data: encodeApprove(SPENDER_OK, UINT256_MAX) as `0x${string}`,
    });
    const res = await handleRequest(
      cfg(),
      {
        jsonrpc: "2.0",
        id: 2,
        method: "eth_sendRawTransaction",
        params: [raw],
      },
      { forward }
    );
    expect(res.error?.code).toBe(ERR_APPROVE_DENIED);
    expect((res.error?.data as { code?: string })?.code).toBe(
      "approve_unbounded"
    );
    expect(forward).not.toHaveBeenCalled();
  });

  it("enabled false forwards unlimited approve", async () => {
    const forward = vi.fn(async () => ({
      jsonrpc: "2.0" as const,
      id: 3,
      result: "0x" + "cd".repeat(32),
    }));
    const raw = await signRaw({
      to: TOKEN_A as `0x${string}`,
      data: encodeApprove(SPENDER_OK, UINT256_MAX) as `0x${string}`,
      nonce: 1,
    });
    const res = await handleRequest(
      cfg({ enabled: false }),
      {
        jsonrpc: "2.0",
        id: 3,
        method: "eth_sendRawTransaction",
        params: [raw],
      },
      { forward }
    );
    expect(res.error).toBeUndefined();
    expect(forward).toHaveBeenCalledOnce();
  });

  it("passthrough for eth_chainId", async () => {
    const forward = vi.fn(async () => ({
      jsonrpc: "2.0" as const,
      id: 1,
      result: "0x1",
    }));
    const res = await handleRequest(
      cfg(),
      { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
      { forward }
    );
    expect(res.result).toBe("0x1");
    expect(res.sendApproveBound?.decision).toBe("passthrough");
  });

  it("does not use -32083 or -32084 for approval denies", async () => {
    const forward = vi.fn();
    const raw = await signRaw({
      to: TOKEN_A as `0x${string}`,
      data: encodeApprove(SPENDER_OK, 9999n) as `0x${string}`,
      nonce: 2,
    });
    const res = await handleRequest(
      cfg({ max: 100n }),
      {
        jsonrpc: "2.0",
        id: 4,
        method: "eth_sendRawTransaction",
        params: [raw],
      },
      { forward }
    );
    expect(res.error?.code).toBe(ERR_APPROVE_DENIED);
    expect(res.error?.code).not.toBe(-32083);
    expect(res.error?.code).not.toBe(-32084);
  });
});
