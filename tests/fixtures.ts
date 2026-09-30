import {
  SELECTOR_APPROVE,
  SELECTOR_INCREASE_ALLOWANCE,
  SELECTOR_SET_APPROVAL_FOR_ALL,
  UINT256_MAX,
} from "../src/selectors.js";
import {
  defaultApproveBoundPolicy,
  type ApproveBoundPolicy,
  type TokenPolicyEntry,
} from "../src/types.js";
import { type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const SPENDER_OK = "0x1111111111111111111111111111111111111111";
export const SPENDER_BAD = "0x2222222222222222222222222222222222222222";
export const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const TOKEN_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
export const TOKEN_NFT = "0xcccccccccccccccccccccccccccccccccccccccc";
export const TOKEN_1155 = "0xdddddddddddddddddddddddddddddddddddddddd";
export const ZERO = "0x0000000000000000000000000000000000000000";

/** Anvil/Hardhat account #0 — public test key only. */
export const TEST_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

export const UNDECODABLE_RAW = "0xdeadbeef" as Hex;

function addrWord(addr: string): string {
  return addr.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
}
function uintWord(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}
function boolWord(v: boolean): string {
  return uintWord(v ? 1n : 0n);
}

export function encodeApprove(spender: string, amount: bigint): string {
  return SELECTOR_APPROVE + addrWord(spender) + uintWord(amount);
}
export function encodeIncrease(spender: string, amount: bigint): string {
  return SELECTOR_INCREASE_ALLOWANCE + addrWord(spender) + uintWord(amount);
}
export function encodeSetApprovalForAll(
  spender: string,
  approved: boolean
): string {
  return SELECTOR_SET_APPROVAL_FOR_ALL + addrWord(spender) + boolWord(approved);
}

/** Dirty high-byte address word (non-canonical padding). */
export function encodeApproveDirtyAddr(
  spender: string,
  amount: bigint
): string {
  const dirty =
    "000000000000000000000001" +
    spender.replace(/^0x/i, "").toLowerCase().padStart(40, "0");
  return SELECTOR_APPROVE + dirty + uintWord(amount);
}

/** Bool word = 2 (non-canonical). */
export function encodeSetApprovalDirtyBool(spender: string): string {
  return (
    SELECTOR_SET_APPROVAL_FOR_ALL + addrWord(spender) + uintWord(2n)
  );
}

export { UINT256_MAX };

export function erc20Policy(
  token: string,
  maxAmountRaw: bigint,
  spenders: string[] = [SPENDER_OK]
): ApproveBoundPolicy {
  const p = defaultApproveBoundPolicy();
  p.tokens = new Map([
    [
      token.toLowerCase(),
      {
        standard: "erc20",
        spenders: new Set(spenders.map((s) => s.toLowerCase())),
        maxAmountRaw,
      } satisfies TokenPolicyEntry,
    ],
  ]);
  return p;
}

export function multiTokenPolicy(
  entries: Array<{
    token: string;
    standard: "erc20" | "erc721" | "erc1155";
    maxAmountRaw?: bigint;
    spenders?: string[];
  }>
): ApproveBoundPolicy {
  const p = defaultApproveBoundPolicy();
  const map = new Map<string, TokenPolicyEntry>();
  for (const e of entries) {
    const entry: TokenPolicyEntry = {
      standard: e.standard,
      spenders: new Set(
        (e.spenders ?? [SPENDER_OK]).map((s) => s.toLowerCase())
      ),
    };
    if (e.standard === "erc20") {
      entry.maxAmountRaw = e.maxAmountRaw ?? 0n;
    }
    map.set(e.token.toLowerCase(), entry);
  }
  p.tokens = map;
  return p;
}

/** Sign an EIP-1559 raw tx offline (no RPC). */
export async function signRaw(opts: {
  to?: Hex;
  data?: Hex;
  value?: bigint;
  nonce?: number;
}): Promise<Hex> {
  const account = privateKeyToAccount(TEST_PK);
  return account.signTransaction({
    to: opts.to,
    data: opts.data ?? "0x",
    value: opts.value ?? 0n,
    nonce: opts.nonce ?? 0,
    gas: 100000n,
    maxFeePerGas: 1_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    chainId: 31337,
    type: "eip1559",
  });
}
