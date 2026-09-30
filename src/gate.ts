import { decodeApproveCalldata } from "./decode.js";
import { evaluateApproveBound } from "./evaluate.js";
import type { ApproveBoundPolicy, ApproveCheckResult } from "./types.js";

export interface GateInput {
  /** Token contract address (tx.to). Required for approval-shaped calldata. */
  to?: string | null;
  /** Contract calldata (tx.data). */
  data?: string | null;
}

/**
 * Compose-friendly gate: decode → evaluate. Fail-closed on definite deny.
 * Policy key is tx.to (DC1), never inferred from selector alone.
 */
export function gateApproveBound(
  policy: ApproveBoundPolicy,
  input: GateInput
): ApproveCheckResult {
  const call = decodeApproveCalldata(input.data);
  return evaluateApproveBound(policy, call, input.to);
}
