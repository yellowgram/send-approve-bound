/** Closed deny-code set for P0 (DC12). */
export type ApproveDenyCode =
  | "approve_unbounded"
  | "spender_not_allowed"
  | "approve_over_cap"
  | "approve_undecodable"
  | "token_not_allowed"
  | "approve_policy_incomplete"
  | "tx_unparseable";

export type ApproveKind =
  | "approve"
  | "increaseAllowance"
  | "setApprovalForAll"
  | "other";

export type TokenStandard = "erc20" | "erc721" | "erc1155";

/** Per-token policy entry. Keyed by lowercase token address (tx.to). */
export interface TokenPolicyEntry {
  standard: TokenStandard;
  /** Lowercased spender / operator addresses. */
  spenders: Set<string>;
  /**
   * Absolute raw uint256 cap for erc20 approve / increaseAllowance delta.
   * Required for erc20; must be absent for erc721/erc1155.
   */
  maxAmountRaw?: bigint;
}

/**
 * Approve-bound policy. No global maxAmount / rejectUnlimited (DC1–DC5).
 * Unlimited is always denied while enabled.
 */
export interface ApproveBoundPolicy {
  /** When false, gate is a no-op (pass-through). Must be explicit in policy file. */
  enabled: boolean;
  /** lowercase 0x-address → token entry */
  tokens: Map<string, TokenPolicyEntry>;
}

export interface ApproveCall {
  kind: ApproveKind;
  spender?: string;
  amount?: bigint;
  approved?: boolean;
  /** True when selector matched but args could not be decoded. */
  undecodable?: boolean;
}

export interface ApproveCheckResult {
  allow: boolean;
  code?: ApproveDenyCode;
  reason?: string;
  kind: ApproveKind;
}

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: unknown[];
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
  sendApproveBound?: SendApproveBoundResponseMeta;
}

export type Decision =
  | "forward"
  | "policy_denied"
  | "unsigned_refused"
  | "passthrough"
  | "create_forward";

export interface SendApproveBoundResponseMeta {
  sendApproveBound: true;
  decision: Decision;
  policyCode: ApproveDenyCode | null;
  aborted: boolean;
  reason?: string;
}

export interface SendApproveBoundConfig {
  listenHost: string;
  listenPort: number;
  upstreamRpcUrl: string;
  policy: ApproveBoundPolicy;
  decisionLogPath?: string;
}

/** Align with L2 Send Guard / send-allow for unsigned refuse. */
export const ERR_UNSIGNED_SEND_REFUSED = -32081;
/** Approval deny + unparseable raw (this package only; not -32083/-32084). */
export const ERR_APPROVE_DENIED = -32085;

export const SEND_METHODS = new Set([
  "eth_sendRawTransaction",
  "eth_sendRawTransactionSync",
]);

export const UNSIGNED_SEND_METHODS = new Set(["eth_sendTransaction"]);

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function defaultApproveBoundPolicy(): ApproveBoundPolicy {
  return {
    enabled: true,
    tokens: new Map(),
  };
}
