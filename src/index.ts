#!/usr/bin/env node
/**
 * send-approve-bound CLI — JSON-RPC approval calldata gate.
 * No key custody. No simulation. See README + CHARTER.md.
 */
import { loadConfig } from "./config.js";
import { listen } from "./proxy/server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  await listen(config);
}

main().catch((err) => {
  console.error(
    "[send-approve-bound] fatal:",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
});
