# IMPLEMENT_NOTES — send-approve-bound P0

**As of:** 2026-09-30 (ET)  
**Against:** `/workspace/send-approve-bound-lg/DESIGN-GATE.md` PASS-with-conditions (DC1–DC15)  
**Artifact:** `/workspace/send-approve-bound` (still `"private": true`; public remote https://github.com/yellowgram/send-approve-bound; **not** on npm)

## What changed vs scaffold

| Area | Scaffold | P0 implement |
| --- | --- | --- |
| Policy | Global `spenders` + `maxAmount` + `rejectUnlimited` | Per-token map keyed by `tx.to`: `standard` + `spenders` + erc20-only `maxAmountRaw`. `rejectUnlimited` deleted |
| Gate input | `{ data }` only | `{ to?, data? }` — approval-shaped without address `to` → `approve_undecodable` |
| Decode | Sliced last 20 bytes; bool `!== 0` | Canonical ABI (DC4): 24 zero hex + 20 bytes; bool word `0`/`1` only |
| Evaluate | One amount branch for approve + increaseAllowance; NFT treated as amount | Selector × standard (DC3); increaseAllowance = per-call raw delta; erc721 tokenId not capped; revokes narrow (DC9) |
| Unlimited | Optional via `rejectUnlimited` | Always denied while enabled (DC5) |
| Middleware | Absent | Thin `eth_sendRawTransaction` handler: unsigned → `-32081`; denies + unparseable → `-32085`; never fail-open |
| Deny codes | 4 codes | Closed set DC12 (+ `token_not_allowed`, `approve_policy_incomplete`, `tx_unparseable`) |
| Docs | Scaffold deny table | Verbatim honesty lines DC6/DC7/DC8/DC15 in README + SECURITY |
| package.json | private, no public URLs | Still `"private": true` (blocks accidental publish); public `repository` / `homepage` / `bugs`; **not** on npm; no Polar |

## DC checklist

| ID | Status | Notes |
| --- | --- | --- |
| DC1 | satisfied | Policy key = `tx.to`; missing/non-address → `approve_undecodable` |
| DC2 | satisfied | Token map load validates standard / maxAmountRaw / address keys / checksum dupes; miss → `token_not_allowed` |
| DC3 | satisfied | Selector × standard branches in `evaluate.ts` |
| DC4 | satisfied | Canonical address/bool words; trailing bytes ignored |
| DC5 | satisfied | No `rejectUnlimited`; unlimited always deny when enabled |
| DC6 | satisfied | Delta-only; no `eth_call` / `allowance()`; verbatim line in README + SECURITY |
| DC7 | satisfied | Verbatim raw-units line in README |
| DC8 | satisfied | Multicall selectors pass-through + tests; verbatim lines in README + SECURITY |
| DC9 | satisfied | Revokes narrow (erc20 approve0, erc721 zero-addr, setApprovalForAll false) |
| DC10 | satisfied | Explicit `enabled` boolean; invalid/missing file refuses start; `gate_disabled` on stderr; example `enabled:true` + empty tokens |
| DC11 | satisfied | Handler: `-32081` unsigned; `-32085` deny/unparseable; create forward; no fail-open |
| DC12 | satisfied | Closed deny-code set only |
| DC13 | satisfied | Tests cover (1)–(9) + existing unlimited/over-cap/spender/transfer cases |
| DC14 | satisfied | private; Soft* ban token only; offline demo + `docs/DEMO.md`; no npm/Polar/Permit2 product / multicall decoder / sim / key |
| DC15 | satisfied | Verbatim 721 line in README |

## Rejected (not shipped)

R1–R17 from DESIGN-GATE remain rejected: no multicall unwind, no Permit2 product, no custody/sim, no global cap, no human decimals, no npm/Polar, no Soft\* conversion copy. Public GitHub is intentional; npm publish stays LaunchGate + founder.

## Verification (this implement)

- `npm test` — **47 passed** (3 files: evaluate, policy.load, handler)
- `npm run demo:offline` — OK, matches `docs/fixtures/offline.expected.txt`

## DC still open

None of DC1–DC15 are left intentionally open for this P0. Expansion items (refuse-router, extra selectors, fleet UX) remain LaunchGate-gated and out of this implement.
