import {
  parseTransaction,
  type Hex,
  type TransactionSerializable,
} from "viem";

export interface ParsedSend {
  raw: Hex;
  tx: TransactionSerializable;
  to?: Hex;
  data?: Hex;
  value: bigint;
  /** True when tx.to is absent (contract create). */
  isCreate: boolean;
}

/**
 * Parse a signed raw tx without needing the private key.
 * Never custodies keys — fields only for approve-bound checks.
 */
export function parseRawTransaction(raw: Hex): ParsedSend {
  const tx = parseTransaction(raw);
  const isCreate = tx.to === undefined || tx.to === null;
  return {
    raw,
    tx,
    to: isCreate ? undefined : (tx.to as Hex),
    data: (tx.data as Hex | undefined) ?? "0x",
    value: tx.value ?? 0n,
    isCreate,
  };
}
