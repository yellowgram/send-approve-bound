# send-approve-bound

More from yellowgram: [OSS tools](https://www.yellowgram.dev/oss).

**Status:** public MIT · npm `send-approve-bound@0.1.0` · no Polar

Non-custodial **at-send** gate for ERC-20 / ERC-721 / ERC-1155 approval calldata: per-token spender allowlist, erc20 raw amount / delta caps, unlimited always denied. Compose **after** send-allow. No keys. No simulation.

> **Charter:** [CHARTER.md](./CHARTER.md) — no Soft\* · no Polar/checkout · no custody · not published to npm

## Pin (local)

```bash
npm install
npm test
npm run demo:offline
```

## Policy shape

Policy key is the **token contract** (`tx.to`), not a global spender set.

```json
{
  "enabled": true,
  "tokens": {
    "0xToken…": {
      "standard": "erc20",
      "maxAmountRaw": "1000000",
      "spenders": ["0xSpender…"]
    },
    "0xNft…": {
      "standard": "erc721",
      "spenders": ["0xOperator…"]
    }
  }
}
```

- `maxAmountRaw` is required for `erc20` only (decimal integer string). Forbidden on `erc721` / `erc1155`.
- `enabled: false` is the only allow-all and must be explicit; boot logs `gate_disabled`.
- Default example ships `enabled: true` with empty `tokens` (deny-all approval-shaped).

## Honesty (locked)

maxAmountRaw is an integer in the token's smallest unit. This package does not apply decimals.

increaseAllowance is a per-call raw delta against that token's maxAmountRaw. This gate does not read allowance(). Repeated deltas can stack above any absolute budget.

ERC-721 approve uses the same selector as ERC-20 approve. The uint256 is a tokenId and is not compared to maxAmountRaw. The token standard comes only from the policy entry for tx.to.

Calldata whose selector is not approve, increaseAllowance, or setApprovalForAll is passed through, including multicall and router batches. This gate does not unwind inner calls. A wrapped unlimited approve is invisible here.

Permit, Permit2, and EIP-2612 selectors are not decoded in this package.

## Deny codes (P0)

| Code | Meaning |
| --- | --- |
| `approve_unbounded` | uint256 max approve / increaseAllowance, or `setApprovalForAll(true)` |
| `spender_not_allowed` | spender / operator not on that token’s allowlist |
| `approve_over_cap` | erc20 amount or increaseAllowance delta exceeds `maxAmountRaw` |
| `approve_undecodable` | approval-shaped but non-canonical / wrong standard / missing `to` |
| `token_not_allowed` | `tx.to` not in the token map |
| `approve_policy_incomplete` | in-memory erc20 entry missing `maxAmountRaw` |
| `tx_unparseable` | signed raw could not be parsed (middleware) |

## JSON-RPC

| Code | Meaning |
| --- | --- |
| **-32081** | `eth_sendTransaction` refused — no key custody |
| **-32085** | approval deny or unparseable raw (`error.data.package = "send-approve-bound"`) |

Not `-32083` / `-32084` (those belong to other send-path packages). Unparseable raw **never** fail-opens.

Contract create (`to` null) is forwarded without approval decode; constructor-hidden grants are outside P0.

## Compose

`send-allow → send-approve-bound → send-permit2-bound → …`

## License

MIT — [LICENSE](./LICENSE).
