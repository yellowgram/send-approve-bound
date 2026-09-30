import type { ApproveCall, ApproveKind } from "./types.js";
import {
  SELECTOR_APPROVE,
  SELECTOR_INCREASE_ALLOWANCE,
  SELECTOR_SET_APPROVAL_FOR_ALL,
} from "./selectors.js";

function strip0x(hex: string): string {
  return hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
}

/**
 * Canonical ABI address word: 24 zero hex chars + 20-byte address (DC4).
 * Dirty high bytes → undecodable (not sliced).
 */
function canonicalAddr(word: string): string | undefined {
  if (word.length !== 64) return undefined;
  if (!/^[0-9a-f]{64}$/.test(word)) return undefined;
  if (word.slice(0, 24) !== "0".repeat(24)) return undefined;
  return "0x" + word.slice(24);
}

function parseUint(word: string): bigint | undefined {
  if (word.length !== 64) return undefined;
  if (!/^[0-9a-f]{64}$/.test(word)) return undefined;
  try {
    return BigInt("0x" + word);
  } catch {
    return undefined;
  }
}

/** Bool word must be exactly 0 or 1 (DC4). */
function canonicalBool(word: string): boolean | undefined {
  if (word.length !== 64) return undefined;
  if (!/^[0-9a-f]{64}$/.test(word)) return undefined;
  if (word === "0".repeat(64)) return false;
  if (word === "0".repeat(63) + "1") return true;
  return undefined;
}

/**
 * Decode approval-shaped calldata. Non-approval → kind "other".
 * Malformed approval-shaped → undecodable.
 * Extra trailing bytes after two words are ignored (not another call).
 */
export function decodeApproveCalldata(
  data: string | undefined | null
): ApproveCall {
  if (!data || data === "0x" || data === "0X") {
    return { kind: "other" };
  }
  const hex = strip0x(data).toLowerCase();
  if (hex.length < 8) return { kind: "other" };
  const selector = "0x" + hex.slice(0, 8);
  const body = hex.slice(8);

  let kind: ApproveKind = "other";
  if (selector === SELECTOR_APPROVE) kind = "approve";
  else if (selector === SELECTOR_INCREASE_ALLOWANCE) kind = "increaseAllowance";
  else if (selector === SELECTOR_SET_APPROVAL_FOR_ALL)
    kind = "setApprovalForAll";
  else return { kind: "other" };

  // Need at least two 32-byte words (DC4).
  if (body.length < 128) return { kind, undecodable: true };

  if (kind === "setApprovalForAll") {
    const spender = canonicalAddr(body.slice(0, 64));
    const approved = canonicalBool(body.slice(64, 128));
    if (!spender || approved === undefined) return { kind, undecodable: true };
    return { kind, spender, approved };
  }

  const spender = canonicalAddr(body.slice(0, 64));
  const amount = parseUint(body.slice(64, 128));
  if (!spender || amount === undefined) return { kind, undecodable: true };
  return { kind, spender, amount };
}
