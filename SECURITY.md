# Security

send-approve-bound gates approval-shaped calldata on already-signed `eth_sendRawTransaction` paths. It does not custody keys. It does not simulate. It is not a hosted service or mainnet SLA.

## Honesty (locked)

increaseAllowance is a per-call raw delta against that token's maxAmountRaw. This gate does not read allowance(). Repeated deltas can stack above any absolute budget.

Calldata whose selector is not approve, increaseAllowance, or setApprovalForAll is passed through, including multicall and router batches. This gate does not unwind inner calls. A wrapped unlimited approve is invisible here.

Permit, Permit2, and EIP-2612 selectors are not decoded in this package.

Unlimited `approve` / `increaseAllowance(uint256 max)` / `setApprovalForAll(true)` are always denied while the gate is enabled. There is no `rejectUnlimited` off switch.

## Bind

Default listen address is `127.0.0.1`. Binding `0.0.0.0` without an ACL makes the proxy an unauthenticated forwarder onto your upstream RPC.

## Reporting

Do not open a public issue with a funded raw transaction or a private key. Prefer a private advisory when a private repo exists. Include package version/commit and a sealed repro. No bug-bounty program in this package.
