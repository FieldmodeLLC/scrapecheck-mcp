import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildMcpServer } from "./server.js";
import { buildPaymentSetup, type PaymentSetup } from "./payment.js";

/**
 * Stdio entry point — for local installs (Claude Desktop, Cursor, any MCP
 * client that spawns servers) and directory build-tests (Glama runs servers
 * through mcp-proxy over stdio).
 *
 * Env (same names as the HTTP entry, src/main.ts), all OPTIONAL here:
 *   SCRAPECHECK_ORIGIN   origin base URL (default https://scrapecheck.fly.dev)
 *   SERVICE_API_KEY      the origin's service-key rail. WITHOUT it the server
 *                        still boots and lists its tools; tool calls that
 *                        reach the origin's authenticated rail will return
 *                        the origin's error instead of a verdict. Paying per
 *                        call over x402 needs no service key.
 *   MCP_PAYMENTS         "off" to run without payments; ALSO defaults off
 *                        when PAYOUT_WALLET_ADDRESS is absent (a spawned
 *                        local server should never exit(1) over a wallet it
 *                        was not given).
 *   X402_NETWORK, PAYOUT_WALLET_ADDRESS, CDP_API_KEY_ID, CDP_API_KEY_SECRET,
 *   FACILITATOR_URL, MCP_FREE_ALLOWANCE — as in src/main.ts.
 *
 * IMPORTANT: stdout is the MCP wire in stdio mode; every diagnostic below
 * goes to stderr.
 */

const ENV_PATH = fileURLToPath(new URL("../../.env", import.meta.url));
const env: Record<string, string> = {};
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]!] = m[2]!;
  }
}
const get = (name: string): string | undefined => process.env[name] ?? env[name];

const origin = get("SCRAPECHECK_ORIGIN") ?? "https://scrapecheck.fly.dev";
const serviceKey = get("SERVICE_API_KEY") ?? "";
if (!serviceKey) {
  console.error("scrapecheck-mcp (stdio): no SERVICE_API_KEY — tools are listed, but origin-rail calls will return the origin's auth error. x402-paid calls are unaffected.");
}

let payment: PaymentSetup | null = null;
const payTo = get("PAYOUT_WALLET_ADDRESS");
if (get("MCP_PAYMENTS") !== "off" && payTo) {
  const network = get("X402_NETWORK") === "base-sepolia" ? ("base-sepolia" as const) : ("base" as const);
  payment = await buildPaymentSetup({
    network,
    payTo,
    cdpApiKeyId: get("CDP_API_KEY_ID"),
    cdpApiKeySecret: get("CDP_API_KEY_SECRET"),
    facilitatorUrl: get("FACILITATOR_URL"),
  });
  console.error(`scrapecheck-mcp (stdio): payments ON (network=${network})`);
} else {
  console.error("scrapecheck-mcp (stdio): payments OFF (free allowance only)");
}

const freeAllowance = get("MCP_FREE_ALLOWANCE") !== "off";

const server = await buildMcpServer({ origin, serviceKey, payment, freeAllowance });
await server.connect(new StdioServerTransport());
console.error(`scrapecheck-mcp (stdio): connected, origin=${origin}`);
