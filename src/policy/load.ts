import { readFileSync } from "node:fs";
import { getAddress } from "viem";
import {
  defaultApproveBoundPolicy,
  type ApproveBoundPolicy,
  type TokenPolicyEntry,
  type TokenStandard,
} from "../types.js";

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const RAW_INT_RE = /^(0|[1-9][0-9]*)$/;

function normKey(addr: string): string {
  return getAddress(addr).toLowerCase();
}

function isAddress(s: unknown): s is string {
  return typeof s === "string" && ADDR_RE.test(s);
}

function parseMaxAmountRaw(v: unknown, label: string): bigint {
  if (typeof v !== "string") {
    throw new Error(
      `${label}: maxAmountRaw must be a decimal integer string (no 0x, no decimals, no scientific notation)`
    );
  }
  if (v.startsWith("0x") || v.startsWith("0X")) {
    throw new Error(`${label}: maxAmountRaw must not be hex (no 0x prefix)`);
  }
  if (v.includes(".") || v.includes("e") || v.includes("E") || v.includes("+")) {
    throw new Error(
      `${label}: maxAmountRaw must be a plain decimal integer (no decimals / scientific)`
    );
  }
  if (!RAW_INT_RE.test(v)) {
    throw new Error(
      `${label}: maxAmountRaw must be a decimal integer string (no leading zeros except 0)`
    );
  }
  try {
    return BigInt(v);
  } catch {
    throw new Error(`${label}: maxAmountRaw is not a valid integer`);
  }
}

interface TokenFileEntry {
  standard?: string;
  spenders?: unknown;
  maxAmountRaw?: unknown;
}

interface PolicyFileJson {
  enabled?: unknown;
  tokens?: Record<string, TokenFileEntry>;
}

/**
 * Validate and load an approve-bound policy document.
 * Schema-invalid / unreadable → throw (caller exits non-zero; never boot as allow).
 */
export function parseApproveBoundPolicyDocument(
  json: unknown,
  source = "policy"
): ApproveBoundPolicy {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new Error(`${source}: root must be an object`);
  }
  const doc = json as PolicyFileJson;

  if (typeof doc.enabled !== "boolean") {
    throw new Error(
      `${source}: enabled must be an explicit boolean (DC10). Refusing to start.`
    );
  }

  if (doc.tokens === undefined || doc.tokens === null) {
    throw new Error(`${source}: tokens object is required (may be empty)`);
  }
  if (typeof doc.tokens !== "object" || Array.isArray(doc.tokens)) {
    throw new Error(`${source}: tokens must be an object keyed by token address`);
  }

  const tokens = new Map<string, TokenPolicyEntry>();
  const seenNorm = new Map<string, string>(); // norm → original key

  for (const [rawKey, entry] of Object.entries(doc.tokens)) {
    if (!isAddress(rawKey)) {
      throw new Error(`${source}: token key ${rawKey} is not a 20-byte address`);
    }
    let key: string;
    try {
      key = normKey(rawKey);
    } catch {
      throw new Error(`${source}: token key ${rawKey} is not a valid address`);
    }
    const prior = seenNorm.get(key);
    if (prior !== undefined && prior !== rawKey) {
      throw new Error(
        `${source}: duplicate token keys differing only by checksum: ${prior} and ${rawKey}`
      );
    }
    seenNorm.set(key, rawKey);

    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${source}: tokens[${rawKey}] must be an object`);
    }

    const standard = entry.standard;
    if (
      standard !== "erc20" &&
      standard !== "erc721" &&
      standard !== "erc1155"
    ) {
      throw new Error(
        `${source}: tokens[${rawKey}].standard must be erc20|erc721|erc1155`
      );
    }

    if (!Array.isArray(entry.spenders)) {
      throw new Error(
        `${source}: tokens[${rawKey}].spenders must be an array of addresses`
      );
    }
    const spenders = new Set<string>();
    for (const s of entry.spenders) {
      if (!isAddress(s)) {
        throw new Error(
          `${source}: tokens[${rawKey}].spenders entry is not an address: ${String(s)}`
        );
      }
      spenders.add(normKey(s));
    }

    const hasMax =
      entry.maxAmountRaw !== undefined && entry.maxAmountRaw !== null;

    if (standard === "erc20") {
      if (!hasMax) {
        throw new Error(
          `${source}: tokens[${rawKey}] erc20 requires maxAmountRaw`
        );
      }
      const maxAmountRaw = parseMaxAmountRaw(
        entry.maxAmountRaw,
        `tokens[${rawKey}]`
      );
      tokens.set(key, {
        standard: standard as TokenStandard,
        spenders,
        maxAmountRaw,
      });
    } else {
      if (hasMax) {
        throw new Error(
          `${source}: tokens[${rawKey}] ${standard} must not have maxAmountRaw`
        );
      }
      tokens.set(key, {
        standard: standard as TokenStandard,
        spenders,
      });
    }
  }

  return { enabled: doc.enabled, tokens };
}

export function loadApproveBoundPolicyFile(path: string): ApproveBoundPolicy {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(
      `Failed to load policy file ${path}: ${err instanceof Error ? err.message : String(err)}. Refusing to start — policy will not silently disable.`
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch (err) {
    throw new Error(
      `Invalid JSON in policy file ${path}: ${err instanceof Error ? err.message : String(err)}. Refusing to start.`
    );
  }
  return parseApproveBoundPolicyDocument(json, path);
}

/**
 * Load policy from path or return default deny-all (enabled + empty tokens).
 * When enabled is false, caller must log gate_disabled (DC10).
 */
export function loadApproveBoundPolicy(
  filePath?: string
): ApproveBoundPolicy {
  if (!filePath) {
    return defaultApproveBoundPolicy();
  }
  return loadApproveBoundPolicyFile(filePath);
}
