import { appendFileSync } from "node:fs";
import type { Hex } from "viem";
import { parseRawTransaction } from "../raw.js";
import { gateApproveBound } from "../gate.js";
import {
  ERR_APPROVE_DENIED,
  ERR_UNSIGNED_SEND_REFUSED,
  SEND_METHODS,
  UNSIGNED_SEND_METHODS,
  type ApproveDenyCode,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type SendApproveBoundConfig,
  type SendApproveBoundResponseMeta,
} from "../types.js";

export interface HandlerDeps {
  forward?: (
    url: string,
    body: JsonRpcRequest
  ) => Promise<JsonRpcResponse>;
}

async function forwardRaw(
  url: string,
  body: JsonRpcRequest
): Promise<JsonRpcResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as JsonRpcResponse;
}

function writeLog(
  config: SendApproveBoundConfig,
  method: string,
  meta: SendApproveBoundResponseMeta,
  code: number | null
): void {
  if (!config.decisionLogPath) return;
  try {
    appendFileSync(
      config.decisionLogPath,
      JSON.stringify({
        ts: new Date().toISOString(),
        method,
        code,
        ...meta,
      }) + "\n"
    );
  } catch {
    // never brick the send path on log I/O
  }
}

function denied(
  config: SendApproveBoundConfig,
  req: JsonRpcRequest,
  opts: { code: ApproveDenyCode; reason: string }
): JsonRpcResponse {
  const meta: SendApproveBoundResponseMeta = {
    sendApproveBound: true,
    decision: "policy_denied",
    policyCode: opts.code,
    aborted: true,
    reason: opts.reason,
  };
  writeLog(config, req.method, meta, ERR_APPROVE_DENIED);
  return {
    jsonrpc: "2.0",
    id: req.id,
    sendApproveBound: meta,
    error: {
      code: ERR_APPROVE_DENIED,
      message: `send-approve-bound: ${opts.code} — ${opts.reason}`,
      data: {
        package: "send-approve-bound",
        code: opts.code,
        reason: opts.reason,
      },
    },
  };
}

/**
 * Thin middleware (DC11):
 * 1. Refuse eth_sendTransaction (-32081). No key custody.
 * 2. Non-send methods → passthrough to upstream.
 * 3. Parse signed raw. Unparseable → -32085 tx_unparseable (never fail-open).
 * 4. Contract create (to null) → forward without approval decode.
 * 5. If policy enabled, gateApproveBound. Deny → -32085. Else forward.
 * Evaluate stays pure; middleware is the only I/O.
 */
export async function handleRequest(
  config: SendApproveBoundConfig,
  req: JsonRpcRequest,
  deps: HandlerDeps = {}
): Promise<JsonRpcResponse> {
  const forward =
    deps.forward ?? ((url, body) => forwardRaw(url, body));

  if (UNSIGNED_SEND_METHODS.has(req.method)) {
    const meta: SendApproveBoundResponseMeta = {
      sendApproveBound: true,
      decision: "unsigned_refused",
      policyCode: null,
      aborted: true,
      reason: "eth_sendTransaction refused — no key custody",
    };
    writeLog(config, req.method, meta, ERR_UNSIGNED_SEND_REFUSED);
    return {
      jsonrpc: "2.0",
      id: req.id,
      sendApproveBound: meta,
      error: {
        code: ERR_UNSIGNED_SEND_REFUSED,
        message:
          "send-approve-bound: eth_sendTransaction refused — no key custody. Sign externally and submit via eth_sendRawTransaction.",
        data: {
          package: "send-approve-bound",
          code: "unsigned_refused",
          useMethod: "eth_sendRawTransaction",
        },
      },
    };
  }

  if (!SEND_METHODS.has(req.method)) {
    const res = await forward(config.upstreamRpcUrl, req);
    return {
      ...res,
      sendApproveBound: {
        sendApproveBound: true,
        decision: "passthrough",
        policyCode: null,
        aborted: false,
      },
    };
  }

  const raw = req.params?.[0];
  if (typeof raw !== "string" || !raw.startsWith("0x")) {
    return {
      jsonrpc: "2.0",
      id: req.id,
      error: {
        code: -32602,
        message: "invalid params: expected hex raw transaction",
      },
    };
  }

  let parsed: ReturnType<typeof parseRawTransaction>;
  try {
    parsed = parseRawTransaction(raw as Hex);
  } catch (err) {
    return denied(config, req, {
      code: "tx_unparseable",
      reason: `raw transaction unparseable: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // DC11: contract create — forward; constructor-hidden grants outside P0.
  if (parsed.isCreate) {
    const upstream = await forward(config.upstreamRpcUrl, req);
    const meta: SendApproveBoundResponseMeta = {
      sendApproveBound: true,
      decision: "create_forward",
      policyCode: null,
      aborted: false,
      reason: "contract create — approval decode skipped",
    };
    writeLog(config, req.method, meta, null);
    return { ...upstream, sendApproveBound: meta };
  }

  // DC10: enabled false → forward even unlimited (gate_disabled already logged at boot).
  if (config.policy.enabled) {
    const check = gateApproveBound(config.policy, {
      to: parsed.to,
      data: parsed.data,
    });
    if (!check.allow) {
      return denied(config, req, {
        code: check.code ?? "approve_undecodable",
        reason: check.reason ?? "approve-bound denied",
      });
    }
  }

  const upstream = await forward(config.upstreamRpcUrl, req);
  const meta: SendApproveBoundResponseMeta = {
    sendApproveBound: true,
    decision: "forward",
    policyCode: null,
    aborted: false,
  };
  writeLog(config, req.method, meta, null);
  return { ...upstream, sendApproveBound: meta };
}

export async function handlePayload(
  config: SendApproveBoundConfig,
  body: unknown,
  deps?: HandlerDeps
): Promise<JsonRpcResponse | JsonRpcResponse[]> {
  if (Array.isArray(body)) {
    return Promise.all(
      body.map((item) =>
        handleRequest(config, item as JsonRpcRequest, deps)
      )
    );
  }
  return handleRequest(config, body as JsonRpcRequest, deps);
}
