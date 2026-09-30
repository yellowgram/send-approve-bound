import type {
  ApproveBoundPolicy,
  ApproveCall,
  ApproveCheckResult,
  TokenPolicyEntry,
} from "./types.js";
import { ZERO_ADDRESS } from "./types.js";
import { UINT256_MAX } from "./selectors.js";

function norm(addr: string): string {
  return addr.toLowerCase();
}

function spenderAllowed(entry: TokenPolicyEntry, spender: string): boolean {
  // DC9: ignore zero address if present in erc20 spenders.
  if (entry.standard === "erc20" && spender === ZERO_ADDRESS) return false;
  return entry.spenders.has(spender);
}

/**
 * Pure approve-bound check. No network / eth_call / allowance().
 * Definite misses deny (fail-closed). Non-approval → allow (pass-through).
 */
export function evaluateApproveBound(
  policy: ApproveBoundPolicy,
  call: ApproveCall,
  tokenAddress?: string | null
): ApproveCheckResult {
  if (!policy.enabled || call.kind === "other") {
    return { allow: true, kind: call.kind };
  }

  if (call.undecodable) {
    return {
      allow: false,
      code: "approve_undecodable",
      reason: "approval-shaped calldata undecodable",
      kind: call.kind,
    };
  }

  // DC1: approval-shaped requires a token address (tx.to).
  if (!tokenAddress || !/^0x[0-9a-fA-F]{40}$/.test(tokenAddress)) {
    return {
      allow: false,
      code: "approve_undecodable",
      reason: "approval-shaped calldata missing or non-address tx.to",
      kind: call.kind,
    };
  }

  const tokenKey = norm(tokenAddress);
  const entry = policy.tokens.get(tokenKey);
  if (!entry) {
    return {
      allow: false,
      code: "token_not_allowed",
      reason: `token ${tokenKey} not in approve-bound policy map`,
      kind: call.kind,
    };
  }

  // DC3: selector × standard mismatches.
  if (call.kind === "setApprovalForAll" && entry.standard === "erc20") {
    return {
      allow: false,
      code: "approve_undecodable",
      reason: "setApprovalForAll is not valid on an erc20 policy entry",
      kind: call.kind,
    };
  }
  if (call.kind === "increaseAllowance" && entry.standard !== "erc20") {
    return {
      allow: false,
      code: "approve_undecodable",
      reason: "increaseAllowance is only valid on an erc20 policy entry",
      kind: call.kind,
    };
  }
  if (call.kind === "approve" && entry.standard === "erc1155") {
    return {
      allow: false,
      code: "approve_undecodable",
      reason: "erc1155 has no single-id approve in P0",
      kind: call.kind,
    };
  }

  const spender = call.spender ? norm(call.spender) : undefined;
  if (!spender) {
    return {
      allow: false,
      code: "approve_undecodable",
      reason: "missing spender",
      kind: call.kind,
    };
  }

  if (call.kind === "setApprovalForAll") {
    // DC5: setApprovalForAll(true) always unbounded, even if allowlisted.
    if (call.approved === true) {
      return {
        allow: false,
        code: "approve_unbounded",
        reason: "setApprovalForAll(true) always denied (unlimited operator)",
        kind: call.kind,
      };
    }
    // DC9: setApprovalForAll(false) revoke — allow even if operator not listed.
    return { allow: true, kind: call.kind };
  }

  if (call.kind === "approve" && entry.standard === "erc721") {
    // DC3/DC9: uint256 is tokenId — never compare to maxAmountRaw / unbounded.
    // approve to zero address clears one tokenId (revoke).
    if (spender === ZERO_ADDRESS) {
      return { allow: true, kind: call.kind };
    }
    if (!spenderAllowed(entry, spender)) {
      return {
        allow: false,
        code: "spender_not_allowed",
        reason: `operator ${spender} not on erc721 spenders for ${tokenKey}`,
        kind: call.kind,
      };
    }
    return { allow: true, kind: call.kind };
  }

  // Remaining: erc20 approve / increaseAllowance.
  if (entry.standard !== "erc20" || entry.maxAmountRaw === undefined) {
    return {
      allow: false,
      code: "approve_policy_incomplete",
      reason: `erc20 entry for ${tokenKey} missing maxAmountRaw`,
      kind: call.kind,
    };
  }

  const amount = call.amount ?? 0n;
  const maxAmountRaw = entry.maxAmountRaw;

  // DC5: unlimited always denied (before cap).
  if (amount === UINT256_MAX) {
    return {
      allow: false,
      code: "approve_unbounded",
      reason: "unlimited approve / increaseAllowance rejected",
      kind: call.kind,
    };
  }

  if (call.kind === "approve") {
    // DC9: approve(0) revoke — allow even if spender not listed.
    if (amount === 0n) {
      return { allow: true, kind: call.kind };
    }
    // DC9: zero address as erc20 spender on non-zero → spender_not_allowed.
    if (spender === ZERO_ADDRESS || !spenderAllowed(entry, spender)) {
      return {
        allow: false,
        code: "spender_not_allowed",
        reason: `spender ${spender} not on erc20 spenders for ${tokenKey}`,
        kind: call.kind,
      };
    }
    if (amount > maxAmountRaw) {
      return {
        allow: false,
        code: "approve_over_cap",
        reason: `amount ${amount} exceeds maxAmountRaw ${maxAmountRaw}`,
        kind: call.kind,
      };
    }
    return { allow: true, kind: call.kind };
  }

  // increaseAllowance — per-call raw delta only (DC6). Not a revoke at 0.
  if (spender === ZERO_ADDRESS || !spenderAllowed(entry, spender)) {
    return {
      allow: false,
      code: "spender_not_allowed",
      reason: `spender ${spender} not on erc20 spenders for ${tokenKey}`,
      kind: call.kind,
    };
  }
  if (amount > maxAmountRaw) {
    return {
      allow: false,
      code: "approve_over_cap",
      reason: `increaseAllowance delta ${amount} exceeds maxAmountRaw ${maxAmountRaw}`,
      kind: call.kind,
    };
  }
  return { allow: true, kind: call.kind };
}
