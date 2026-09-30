# send-approve-bound — charter fences

**Status:** LOCAL_SCAFFOLD · private · LaunchGate-before-expansion  
**As of:** 2026-09-30 (ET)  
**First LG candidate:** yes (serial queue: this package first)

This package is a **narrow** agent-ops gate. Keep the surface honest. No public GitHub remote and no npm publish until founder + LaunchGate.

## Job (P0)

At `eth_sendRawTransaction` (compose **after** `send-allow`): bound ERC-20 / ERC-721 approval calldata.

- Policy key = **`tx.to`** (per-token map: `erc20` | `erc721` | `erc1155`)
- Spender **allowlist** per token
- ERC-20 **raw** amount / delta caps (`maxAmountRaw`); never a single global cap
- **Reject** unlimited `approve` / `increaseAllowance` / `setApprovalForAll(true)` always (no off switch)
- Emit machine **deny codes** (`approve_unbounded`, `spender_not_allowed`, `approve_over_cap`, `token_not_allowed`, `approve_undecodable`, …)
- Fail-closed on definite policy miss; sealed offline fixtures

## Compose slot

```
… → send-allow → send-approve-bound → send-permit2-bound → …
```

Orthogonal to L2 Send Guard (sim). Complementary to `recv-approval-watch` (detect already-issued).

## In scope (P0)

- Pure evaluate + thin JSON-RPC middleware hook for signed raw submit
- Selectors: `approve`, `increaseAllowance`, `setApprovalForAll` (pinned ABIs / 4-byte)
- Per-token spender allowlist + erc20 raw caps; reject `type(uint256).max` / unlimited NFT operator
- Deny taxonomy aligned with send-deny-codes family (`-32085` for this package)
- Offline `demo:offline` + unit tests
- MIT, self-hosted, local-only until founder

## Out of scope / fences

| Fence | Meaning |
| --- | --- |
| **No key custody** | Refuse unsigned submit paths. Signing stays wallet / agent / KMS. |
| **No simulation** | Does not simulate. Use L2 Send Guard for sim-before-send. |
| **No Soft\*** | No Soft\* naming, briefs, outreach, or monetization wording in copy or scripts. |
| **No Polar / checkout URLs** | No purchase SKU, no hosted checkout links in this tree. |
| **No public/npm until founder** | No public remote, no `npm publish` until LaunchGate + founder GO. |
| **No Safe / custody / SaaS / mainnet SLA** | Not a Safe product, not hosted multi-tenant, no mainnet SLA claim. |
| **No Permit2 product** | Permit2 is `send-permit2-bound`. Do not expand this package into Permit2. |
| **LaunchGate-before-expansion** | P0 only. Extra selectors / multicall unwind / fleet UX need LaunchGate. |

## Fail modes (default)

| Case | Default | Notes |
| --- | --- | --- |
| Unlimited / max approve | **fail-closed** | `approve_unbounded` (always; no `rejectUnlimited` flag) |
| `setApprovalForAll(true)` | **fail-closed** | even when operator allowlisted |
| Spender not allowlisted | **fail-closed** | `spender_not_allowed` |
| Amount / delta over cap | **fail-closed** | `approve_over_cap` (erc20 only) |
| Token `tx.to` not in map | **fail-closed** | `token_not_allowed` |
| Non-approval calldata | **pass-through** | not this gate’s job (incl. multicall) |
| Undecodable when approval-shaped | **fail-closed** | `approve_undecodable` |
| Unparseable signed raw | **fail-closed** | `-32085` `tx_unparseable` (never fail-open) |

## Soft* ban

Forbidden: any Soft* monetization / conversion naming or copy in this package (including hyphenated or spaced Soft* WTP forms). Use Soft* only as the ban token.

## Acceptance sketch (tandem)

Unlimited approve → deny `approve_unbounded` before broadcast (sealed fixture).
