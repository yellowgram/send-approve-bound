# Offline demo

No keys, no capital, no public RPC.

```bash
npm ci
npm test
npm run build
npm run demo:offline
```

`demo:offline` exits non-zero if stdout drifts from [`fixtures/offline.expected.txt`](./fixtures/offline.expected.txt).

What it shows (sealed allow **and** deny):

1. Bounded approve, allowlisted spender → `allow=true`
2. Unlimited approve → deny `approve_unbounded`
3. Bad spender → deny `spender_not_allowed`
4. Over raw cap → deny `approve_over_cap`
5. `setApprovalForAll(true)` (even allowlisted) → deny `approve_unbounded`
6. Transfer calldata → pass-through allow
7. Same calldata, lower-cap token → deny `approve_over_cap`
8. ERC-721 large tokenId → allow (tokenId not capped)
9. `increaseAllowance` delta under cap → allow
10. Unknown token → deny `token_not_allowed`
11. Multicall selector → pass-through (`kind=other`)

Fixture SoT; compose after send-allow. For sim-before-send, use L2 Send Guard separately.
