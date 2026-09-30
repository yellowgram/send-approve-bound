import { describe, it, expect } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseApproveBoundPolicyDocument,
  loadApproveBoundPolicyFile,
} from "../src/policy/load.js";

describe("policy load (DC2 / DC10)", () => {
  it("accepts enabled true + empty tokens", () => {
    const p = parseApproveBoundPolicyDocument({
      enabled: true,
      tokens: {},
    });
    expect(p.enabled).toBe(true);
    expect(p.tokens.size).toBe(0);
  });

  it("refuses missing enabled", () => {
    expect(() =>
      parseApproveBoundPolicyDocument({ tokens: {} })
    ).toThrow(/enabled must be an explicit boolean/);
  });

  it("refuses erc20 without maxAmountRaw", () => {
    expect(() =>
      parseApproveBoundPolicyDocument({
        enabled: true,
        tokens: {
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": {
            standard: "erc20",
            spenders: [],
          },
        },
      })
    ).toThrow(/requires maxAmountRaw/);
  });

  it("refuses maxAmountRaw on erc721", () => {
    expect(() =>
      parseApproveBoundPolicyDocument({
        enabled: true,
        tokens: {
          "0xcccccccccccccccccccccccccccccccccccccccc": {
            standard: "erc721",
            spenders: [],
            maxAmountRaw: "1",
          },
        },
      })
    ).toThrow(/must not have maxAmountRaw/);
  });

  it("refuses hex / scientific maxAmountRaw", () => {
    expect(() =>
      parseApproveBoundPolicyDocument({
        enabled: true,
        tokens: {
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": {
            standard: "erc20",
            spenders: [],
            maxAmountRaw: "0x10",
          },
        },
      })
    ).toThrow(/must not be hex/);

    expect(() =>
      parseApproveBoundPolicyDocument({
        enabled: true,
        tokens: {
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": {
            standard: "erc20",
            spenders: [],
            maxAmountRaw: "1e6",
          },
        },
      })
    ).toThrow(/plain decimal integer/);
  });

  it("refuses duplicate checksum keys", () => {
    expect(() =>
      parseApproveBoundPolicyDocument({
        enabled: true,
        tokens: {
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": {
            standard: "erc20",
            spenders: [],
            maxAmountRaw: "1",
          },
          "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa": {
            standard: "erc20",
            spenders: [],
            maxAmountRaw: "2",
          },
        },
      })
    ).toThrow(/duplicate token keys/);
  });

  it("loads file; missing file refuses", () => {
    const path = join(tmpdir(), `sab-policy-${Date.now()}.json`);
    writeFileSync(
      path,
      JSON.stringify({
        enabled: true,
        tokens: {
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": {
            standard: "erc20",
            maxAmountRaw: "1000",
            spenders: ["0x1111111111111111111111111111111111111111"],
          },
        },
      })
    );
    try {
      const p = loadApproveBoundPolicyFile(path);
      expect(p.tokens.size).toBe(1);
      expect(p.tokens.get("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
        ?.maxAmountRaw).toBe(1000n);
    } finally {
      unlinkSync(path);
    }

    expect(() =>
      loadApproveBoundPolicyFile("/tmp/does-not-exist-sab-policy.json")
    ).toThrow(/Refusing to start/);
  });
});
