import { describe, it, expect } from "vitest";
import { evaluateApproveBound } from "../src/evaluate.js";
import { decodeApproveCalldata } from "../src/decode.js";
import { gateApproveBound } from "../src/gate.js";
import { defaultApproveBoundPolicy } from "../src/types.js";
import {
  SPENDER_OK,
  SPENDER_BAD,
  TOKEN_A,
  TOKEN_B,
  TOKEN_NFT,
  TOKEN_1155,
  ZERO,
  encodeApprove,
  encodeIncrease,
  encodeSetApprovalForAll,
  encodeApproveDirtyAddr,
  encodeSetApprovalDirtyBool,
  erc20Policy,
  multiTokenPolicy,
  UINT256_MAX,
} from "./fixtures.js";

describe("decodeApproveCalldata", () => {
  it("decodes approve", () => {
    const c = decodeApproveCalldata(encodeApprove(SPENDER_OK, 42n));
    expect(c.kind).toBe("approve");
    expect(c.spender).toBe(SPENDER_OK);
    expect(c.amount).toBe(42n);
  });

  it("marks non-approval as other", () => {
    expect(decodeApproveCalldata("0xa9059cbb" + "00".repeat(64)).kind).toBe(
      "other"
    );
  });

  it("dirty address padding → undecodable (DC4)", () => {
    const c = decodeApproveCalldata(encodeApproveDirtyAddr(SPENDER_OK, 10n));
    expect(c.kind).toBe("approve");
    expect(c.undecodable).toBe(true);
  });

  it("bool word 2 → undecodable (DC4)", () => {
    const c = decodeApproveCalldata(encodeSetApprovalDirtyBool(SPENDER_OK));
    expect(c.kind).toBe("setApprovalForAll");
    expect(c.undecodable).toBe(true);
  });

  it("ignores trailing extra words", () => {
    const c = decodeApproveCalldata(
      encodeApprove(SPENDER_OK, 5n) + "ff".repeat(32)
    );
    expect(c.kind).toBe("approve");
    expect(c.amount).toBe(5n);
    expect(c.undecodable).toBeUndefined();
  });
});

describe("evaluateApproveBound — core", () => {
  it("pass-through when disabled", () => {
    const p = erc20Policy(TOKEN_A, 1000n);
    p.enabled = false;
    const r = evaluateApproveBound(
      p,
      { kind: "approve", spender: SPENDER_BAD, amount: UINT256_MAX },
      TOKEN_A
    );
    expect(r.allow).toBe(true);
  });

  it("pass-through non-approval", () => {
    const r = evaluateApproveBound(
      erc20Policy(TOKEN_A, 1000n),
      { kind: "other" },
      TOKEN_A
    );
    expect(r.allow).toBe(true);
  });

  it("denies unbounded approve", () => {
    const r = gateApproveBound(erc20Policy(TOKEN_A, 1000n), {
      to: TOKEN_A,
      data: encodeApprove(SPENDER_OK, UINT256_MAX),
    });
    expect(r.allow).toBe(false);
    expect(r.code).toBe("approve_unbounded");
  });

  it("denies spender not allowlisted", () => {
    const r = gateApproveBound(erc20Policy(TOKEN_A, 1000n), {
      to: TOKEN_A,
      data: encodeApprove(SPENDER_BAD, 10n),
    });
    expect(r.allow).toBe(false);
    expect(r.code).toBe("spender_not_allowed");
  });

  it("denies over cap", () => {
    const r = gateApproveBound(erc20Policy(TOKEN_A, 100n), {
      to: TOKEN_A,
      data: encodeApprove(SPENDER_OK, 101n),
    });
    expect(r.allow).toBe(false);
    expect(r.code).toBe("approve_over_cap");
  });

  it("allows bounded approve to allowlisted spender", () => {
    const r = gateApproveBound(erc20Policy(TOKEN_A, 1000n), {
      to: TOKEN_A,
      data: encodeApprove(SPENDER_OK, 500n),
    });
    expect(r.allow).toBe(true);
  });

  it("denies increaseAllowance unbounded", () => {
    const r = gateApproveBound(erc20Policy(TOKEN_A, 1000n), {
      to: TOKEN_A,
      data: encodeIncrease(SPENDER_OK, UINT256_MAX),
    });
    expect(r.allow).toBe(false);
    expect(r.code).toBe("approve_unbounded");
  });

  it("denies setApprovalForAll(true) even when allowlisted (DC5)", () => {
    const p = multiTokenPolicy([
      { token: TOKEN_NFT, standard: "erc721", spenders: [SPENDER_OK] },
    ]);
    const r = gateApproveBound(p, {
      to: TOKEN_NFT,
      data: encodeSetApprovalForAll(SPENDER_OK, true),
    });
    expect(r.allow).toBe(false);
    expect(r.code).toBe("approve_unbounded");
  });

  it("fail-closed on undecodable approval-shaped", () => {
    const r = gateApproveBound(erc20Policy(TOKEN_A, 1000n), {
      to: TOKEN_A,
      data: "0x095ea7b3dead",
    });
    expect(r.allow).toBe(false);
    expect(r.code).toBe("approve_undecodable");
  });

  it("approval-shaped missing to → approve_undecodable (DC1)", () => {
    const r = gateApproveBound(erc20Policy(TOKEN_A, 1000n), {
      data: encodeApprove(SPENDER_OK, 10n),
    });
    expect(r.allow).toBe(false);
    expect(r.code).toBe("approve_undecodable");
  });

  it("unknown token → token_not_allowed (DC2)", () => {
    const r = gateApproveBound(erc20Policy(TOKEN_A, 1000n), {
      to: TOKEN_B,
      data: encodeApprove(SPENDER_OK, 10n),
    });
    expect(r.allow).toBe(false);
    expect(r.code).toBe("token_not_allowed");
  });

  it("empty tokens map denies approval-shaped with token_not_allowed", () => {
    const p = defaultApproveBoundPolicy();
    const r = gateApproveBound(p, {
      to: TOKEN_A,
      data: encodeApprove(SPENDER_OK, 10n),
    });
    expect(r.allow).toBe(false);
    expect(r.code).toBe("token_not_allowed");
  });
});

describe("DC13 — per-token caps and standards", () => {
  it("(1) same approve calldata, two tokens, opposite allow/deny", () => {
    const p = multiTokenPolicy([
      { token: TOKEN_A, standard: "erc20", maxAmountRaw: 1000n },
      { token: TOKEN_B, standard: "erc20", maxAmountRaw: 100n },
    ]);
    const data = encodeApprove(SPENDER_OK, 500n);
    const a = gateApproveBound(p, { to: TOKEN_A, data });
    const b = gateApproveBound(p, { to: TOKEN_B, data });
    expect(a.allow).toBe(true);
    expect(b.allow).toBe(false);
    expect(b.code).toBe("approve_over_cap");
  });

  it("(2) ERC-721 large tokenId allowlisted → allow, no amount code", () => {
    const p = multiTokenPolicy([
      { token: TOKEN_NFT, standard: "erc721", spenders: [SPENDER_OK] },
    ]);
    const hugeId = 10_000_000n;
    const r = gateApproveBound(p, {
      to: TOKEN_NFT,
      data: encodeApprove(SPENDER_OK, hugeId),
    });
    expect(r.allow).toBe(true);
    expect(r.code).toBeUndefined();
  });

  it("(3) same calldata under erc20 entry → amount rules (over_cap)", () => {
    const p = multiTokenPolicy([
      { token: TOKEN_A, standard: "erc20", maxAmountRaw: 100n },
    ]);
    const hugeId = 10_000_000n;
    const r = gateApproveBound(p, {
      to: TOKEN_A,
      data: encodeApprove(SPENDER_OK, hugeId),
    });
    expect(r.allow).toBe(false);
    expect(r.code).toBe("approve_over_cap");
  });

  it("(3b) UINT256_MAX under erc20 → approve_unbounded", () => {
    const p = multiTokenPolicy([
      { token: TOKEN_A, standard: "erc20", maxAmountRaw: 100n },
    ]);
    const r = gateApproveBound(p, {
      to: TOKEN_A,
      data: encodeApprove(SPENDER_OK, UINT256_MAX),
    });
    expect(r.code).toBe("approve_unbounded");
  });

  it("(4) dirty address / bool → approve_undecodable", () => {
    const p = erc20Policy(TOKEN_A, 1000n);
    const dirty = gateApproveBound(p, {
      to: TOKEN_A,
      data: encodeApproveDirtyAddr(SPENDER_OK, 10n),
    });
    expect(dirty.code).toBe("approve_undecodable");

    const nft = multiTokenPolicy([
      { token: TOKEN_NFT, standard: "erc721" },
    ]);
    const dirtyBool = gateApproveBound(nft, {
      to: TOKEN_NFT,
      data: encodeSetApprovalDirtyBool(SPENDER_OK),
    });
    expect(dirtyBool.code).toBe("approve_undecodable");
  });

  it("(5) setApprovalForAll(true) allowlisted → unbounded; (false) unlist → allow", () => {
    const p = multiTokenPolicy([
      { token: TOKEN_NFT, standard: "erc721", spenders: [SPENDER_OK] },
    ]);
    const t = gateApproveBound(p, {
      to: TOKEN_NFT,
      data: encodeSetApprovalForAll(SPENDER_OK, true),
    });
    expect(t.code).toBe("approve_unbounded");

    const f = gateApproveBound(p, {
      to: TOKEN_NFT,
      data: encodeSetApprovalForAll(SPENDER_BAD, false),
    });
    expect(f.allow).toBe(true);
  });

  it("(6) ERC-20 approve 0 unlist → allow; unknown token → token_not_allowed", () => {
    const p = erc20Policy(TOKEN_A, 1000n);
    const revoke = gateApproveBound(p, {
      to: TOKEN_A,
      data: encodeApprove(SPENDER_BAD, 0n),
    });
    expect(revoke.allow).toBe(true);

    const unknown = gateApproveBound(p, {
      to: TOKEN_B,
      data: encodeApprove(SPENDER_BAD, 0n),
    });
    expect(unknown.code).toBe("token_not_allowed");
  });

  it("(7) two increaseAllowance deltas each <= max both allow (stacking)", () => {
    const p = erc20Policy(TOKEN_A, 100n);
    const d1 = gateApproveBound(p, {
      to: TOKEN_A,
      data: encodeIncrease(SPENDER_OK, 80n),
    });
    const d2 = gateApproveBound(p, {
      to: TOKEN_A,
      data: encodeIncrease(SPENDER_OK, 80n),
    });
    expect(d1.allow).toBe(true);
    expect(d2.allow).toBe(true);
  });

  it("(8) multicall selectors pass through (not unwound)", () => {
    const p = erc20Policy(TOKEN_A, 1000n);
    for (const sel of ["0x252dba42", "0x82ad56cb", "0xac9650d8"]) {
      const r = gateApproveBound(p, {
        to: TOKEN_A,
        data: sel + "00".repeat(64),
      });
      expect(r.allow).toBe(true);
      expect(r.kind).toBe("other");
    }
  });
});

describe("DC9 — revokes and zero address", () => {
  it("erc721 approve to zero → allow (clear tokenId)", () => {
    const p = multiTokenPolicy([{ token: TOKEN_NFT, standard: "erc721" }]);
    const r = gateApproveBound(p, {
      to: TOKEN_NFT,
      data: encodeApprove(ZERO, 42n),
    });
    expect(r.allow).toBe(true);
  });

  it("erc721 tokenId 0 with non-zero operator still needs allowlist", () => {
    const p = multiTokenPolicy([
      { token: TOKEN_NFT, standard: "erc721", spenders: [SPENDER_OK] },
    ]);
    const bad = gateApproveBound(p, {
      to: TOKEN_NFT,
      data: encodeApprove(SPENDER_BAD, 0n),
    });
    expect(bad.code).toBe("spender_not_allowed");
    const ok = gateApproveBound(p, {
      to: TOKEN_NFT,
      data: encodeApprove(SPENDER_OK, 0n),
    });
    expect(ok.allow).toBe(true);
  });

  it("increaseAllowance 0 is not a revoke — spender must be listed", () => {
    const p = erc20Policy(TOKEN_A, 1000n);
    const r = gateApproveBound(p, {
      to: TOKEN_A,
      data: encodeIncrease(SPENDER_BAD, 0n),
    });
    expect(r.code).toBe("spender_not_allowed");
  });

  it("erc20 zero spender non-zero amount → spender_not_allowed", () => {
    const p = erc20Policy(TOKEN_A, 1000n, [SPENDER_OK, ZERO]);
    const r = gateApproveBound(p, {
      to: TOKEN_A,
      data: encodeApprove(ZERO, 10n),
    });
    expect(r.code).toBe("spender_not_allowed");
  });

  it("erc1155 approve → approve_undecodable", () => {
    const p = multiTokenPolicy([
      { token: TOKEN_1155, standard: "erc1155", spenders: [SPENDER_OK] },
    ]);
    const r = gateApproveBound(p, {
      to: TOKEN_1155,
      data: encodeApprove(SPENDER_OK, 1n),
    });
    expect(r.code).toBe("approve_undecodable");
  });

  it("setApprovalForAll on erc20 → approve_undecodable", () => {
    const r = gateApproveBound(erc20Policy(TOKEN_A, 1000n), {
      to: TOKEN_A,
      data: encodeSetApprovalForAll(SPENDER_OK, false),
    });
    expect(r.code).toBe("approve_undecodable");
  });

  it("increaseAllowance on erc721 → approve_undecodable", () => {
    const p = multiTokenPolicy([{ token: TOKEN_NFT, standard: "erc721" }]);
    const r = gateApproveBound(p, {
      to: TOKEN_NFT,
      data: encodeIncrease(SPENDER_OK, 1n),
    });
    expect(r.code).toBe("approve_undecodable");
  });
});
