/**
 * Offline demo — sealed fixture, no public RPC / keys / capital.
 * Diff vs docs/fixtures/offline.expected.txt — exits non-zero on drift.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultApproveBoundPolicy,
  gateApproveBound,
  UINT256_MAX,
  SELECTOR_APPROVE,
  SELECTOR_INCREASE_ALLOWANCE,
  SELECTOR_SET_APPROVAL_FOR_ALL,
} from "../dist/api.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = join(root, "docs/fixtures/offline.expected.txt");

const SPENDER_OK = "0x1111111111111111111111111111111111111111";
const SPENDER_BAD = "0x2222222222222222222222222222222222222222";
const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TOKEN_NFT = "0xcccccccccccccccccccccccccccccccccccccccc";

function addrWord(addr) {
  return addr.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
}
function uintWord(n) {
  return BigInt(n).toString(16).padStart(64, "0");
}
function encodeApprove(spender, amount) {
  return SELECTOR_APPROVE + addrWord(spender) + uintWord(amount);
}
function encodeIncrease(spender, amount) {
  return SELECTOR_INCREASE_ALLOWANCE + addrWord(spender) + uintWord(amount);
}
function encodeSetAll(spender, approved) {
  return (
    SELECTOR_SET_APPROVAL_FOR_ALL +
    addrWord(spender) +
    uintWord(approved ? 1n : 0n)
  );
}

const lines = [];
const out = (s) => {
  lines.push(s);
  process.stdout.write(s + "\n");
};

out("send-approve-bound offline demo");
out("no keys · no capital · no public RPC · compose after send-allow");
out("");

const policy = defaultApproveBoundPolicy();
policy.tokens = new Map([
  [
    TOKEN_A,
    {
      standard: "erc20",
      spenders: new Set([SPENDER_OK]),
      maxAmountRaw: 1000n,
    },
  ],
  [
    TOKEN_B,
    {
      standard: "erc20",
      spenders: new Set([SPENDER_OK]),
      maxAmountRaw: 100n,
    },
  ],
  [
    TOKEN_NFT,
    {
      standard: "erc721",
      spenders: new Set([SPENDER_OK]),
    },
  ],
]);

const r1 = gateApproveBound(policy, {
  to: TOKEN_A,
  data: encodeApprove(SPENDER_OK, 500n),
});
out(`1 bounded approve allowlisted → allow=${r1.allow}`);

const r2 = gateApproveBound(policy, {
  to: TOKEN_A,
  data: encodeApprove(SPENDER_OK, UINT256_MAX),
});
out(`2 unlimited approve → allow=${r2.allow} code=${r2.code}`);

const r3 = gateApproveBound(policy, {
  to: TOKEN_A,
  data: encodeApprove(SPENDER_BAD, 10n),
});
out(`3 bad spender → allow=${r3.allow} code=${r3.code}`);

const r4 = gateApproveBound(policy, {
  to: TOKEN_A,
  data: encodeApprove(SPENDER_OK, 1001n),
});
out(`4 over cap → allow=${r4.allow} code=${r4.code}`);

const r5 = gateApproveBound(policy, {
  to: TOKEN_NFT,
  data: encodeSetAll(SPENDER_OK, true),
});
out(`5 setApprovalForAll(true) allowlisted → allow=${r5.allow} code=${r5.code}`);

const r6 = gateApproveBound(policy, {
  to: TOKEN_A,
  data: "0xa9059cbb" + "00".repeat(64),
});
out(`6 transfer calldata pass-through → allow=${r6.allow}`);

const r7 = gateApproveBound(policy, {
  to: TOKEN_B,
  data: encodeApprove(SPENDER_OK, 500n),
});
out(`7 same calldata token B lower cap → allow=${r7.allow} code=${r7.code}`);

const r8 = gateApproveBound(policy, {
  to: TOKEN_NFT,
  data: encodeApprove(SPENDER_OK, 10000000n),
});
out(`8 erc721 large tokenId → allow=${r8.allow}`);

const r9 = gateApproveBound(policy, {
  to: TOKEN_A,
  data: encodeIncrease(SPENDER_OK, 80n),
});
out(`9 increaseAllowance delta under cap → allow=${r9.allow}`);

const r10 = gateApproveBound(policy, {
  to: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  data: encodeApprove(SPENDER_OK, 1n),
});
out(`10 unknown token → allow=${r10.allow} code=${r10.code}`);

const r11 = gateApproveBound(policy, {
  to: TOKEN_A,
  data: "0x252dba42" + "00".repeat(64),
});
out(`11 multicall selector pass-through → allow=${r11.allow} kind=${r11.kind}`);

out("");
out("charter: no Soft* · no Polar · no custody · LaunchGate-before-expansion");

const expected = readFileSync(EXPECTED, "utf8").replace(/\r\n/g, "\n").trimEnd();
const actual = lines.join("\n").trimEnd();
if (actual !== expected) {
  console.error("\n[demo-offline] stdout drifted from docs/fixtures/offline.expected.txt");
  console.error("--- expected ---\n" + expected);
  console.error("--- actual ---\n" + actual);
  process.exit(1);
}
console.error("[demo-offline] OK — matches offline.expected.txt");
