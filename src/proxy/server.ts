import http from "node:http";
import { PACKAGE_VERSION } from "../version.js";
import { handlePayload } from "./handler.js";
import type { SendApproveBoundConfig } from "../types.js";

export function createServer(config: SendApproveBoundConfig): http.Server {
  return http.createServer(async (req, res) => {
    if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
      const body = JSON.stringify({
        ok: true,
        name: "send-approve-bound",
        version: PACKAGE_VERSION,
        policy: {
          enabled: config.policy.enabled,
          tokenCount: config.policy.tokens.size,
        },
        listen: `${config.listenHost}:${config.listenPort}`,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(body);
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "method not allowed" }));
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "parse error" },
        })
      );
      return;
    }

    try {
      const result = await handlePayload(config, payload);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32000,
            message: err instanceof Error ? err.message : String(err),
          },
        })
      );
    }
  });
}

export function listen(
  config: SendApproveBoundConfig
): Promise<{ server: http.Server; url: string }> {
  if (config.listenHost === "0.0.0.0" || config.listenHost === "::") {
    console.warn(
      "[send-approve-bound] WARNING: binding a wildcard address without an ACL makes this an unauthenticated raw-tx forwarder onto your upstream RPC."
    );
  }
  const server = createServer(config);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.listenPort, config.listenHost, () => {
      const url = `http://${config.listenHost}:${config.listenPort}`;
      console.log(
        `[send-approve-bound] ${PACKAGE_VERSION} listening on ${url} (policy.enabled=${config.policy.enabled}, tokens=${config.policy.tokens.size})`
      );
      resolve({ server, url });
    });
  });
}
