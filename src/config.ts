import { loadApproveBoundPolicy } from "./policy/load.js";
import type { SendApproveBoundConfig } from "./types.js";

function env(key: string, fallback?: string): string | undefined {
  const v = process.env[key];
  if (v !== undefined && v !== "") return v;
  return fallback;
}

function intEnv(key: string, fallback: number): number {
  const v = env(key);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${key} must be a number`);
  return n;
}

/**
 * Load process config from env.
 * Missing / schema-invalid policy → throw (exit non-zero before listen).
 */
export function loadConfig(): SendApproveBoundConfig {
  const upstream =
    env("SEND_APPROVE_BOUND_UPSTREAM_RPC") ??
    env("SEND_APPROVE_BOUND_RPC_URL");
  if (!upstream) {
    throw new Error(
      "SEND_APPROVE_BOUND_UPSTREAM_RPC is required (JSON-RPC URL behind send-approve-bound)"
    );
  }

  const policyPath = env("SEND_APPROVE_BOUND_POLICY_FILE");
  if (!policyPath) {
    throw new Error(
      "SEND_APPROVE_BOUND_POLICY_FILE is required. Refusing to start without an explicit policy file (DC10)."
    );
  }

  const policy = loadApproveBoundPolicy(policyPath);
  if (!policy.enabled) {
    console.error(
      "[send-approve-bound] gate_disabled — policy.enabled=false; approval checks skipped"
    );
  }

  return {
    listenHost: env("SEND_APPROVE_BOUND_HOST") ?? "127.0.0.1",
    listenPort: intEnv("SEND_APPROVE_BOUND_PORT", 8547),
    upstreamRpcUrl: upstream,
    policy,
    decisionLogPath: env("SEND_APPROVE_BOUND_DECISION_LOG"),
  };
}
