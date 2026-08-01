import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildMcpServer, type McpDeps } from "./server.js";

/**
 * Streamable-HTTP host (SPEC §4 transport), STATELESS mode: each POST gets a
 * fresh McpServer + transport, so there is no session state to leak between
 * remote callers and any instance can serve any request. Registries and
 * remote clients connect to POST /mcp; GET /healthz is the liveness probe.
 */

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf-8")) : undefined);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

export function createMcpHttpServer(deps: McpDeps) {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;

    if (path === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "scrapecheck-mcp", origin: deps.origin }));
      return;
    }

    if (path !== "/mcp") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found — MCP endpoint is POST /mcp" }));
      return;
    }

    if (req.method !== "POST") {
      // Stateless mode: no SSE stream to GET, no session to DELETE.
      res.writeHead(405, { "content-type": "application/json", allow: "POST" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Method not allowed — stateless server, POST only" },
          id: null,
        }),
      );
      return;
    }

    try {
      const body = await readBody(req);
      // Caller identity for the origin-enforced free allowance: the platform's
      // client-ip header when deployed behind Fly, else the socket peer.
      const flyIp = req.headers["fly-client-ip"];
      const clientIp =
        (typeof flyIp === "string" && flyIp) || req.socket.remoteAddress?.replace(/^::ffff:/, "") || undefined;
      const server = await buildMcpServer({ ...deps, clientIp });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32700, message: "Parse error" },
            id: null,
          }),
        );
      }
    }
  });
}
