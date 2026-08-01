import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createMcpHttpServer } from "./http.js";
import { buildPaymentSetup, type PaymentSetup } from "./payment.js";

/**
 * Entry point. Env (repo convention: ../.env fallback for local dev):
 *   SCRAPECHECK_ORIGIN   origin base URL (default https://scrapecheck.fly.dev)
 *   SERVICE_API_KEY      required — the origin's service-key rail
 *   MCP_PORT             listen port (default 3402)
 *   MCP_PAYMENTS         "off" to run without payments (free allowance only)
 *   X402_NETWORK         base | base-sepolia (default base)
 *   PAYOUT_WALLET_ADDRESS  settlement recipient (required when payments on)
 *   CDP_API_KEY_ID / CDP_API_KEY_SECRET  facilitator credentials (mainnet)
 *   FACILITATOR_URL      alternative facilitator (testnet/dev)
 *   MCP_FREE_ALLOWANCE   "off" to demand payment on every paid tool call
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
const serviceKey = get("SERVICE_API_KEY");
if (!serviceKey) {
  console.error("SERVICE_API_KEY is required (origin service-key rail).");
  process.exit(1);
}

let payment: PaymentSetup | null = null;
if (get("MCP_PAYMENTS") !== "off") {
  const network = get("X402_NETWORK") === "base-sepolia" ? ("base-sepolia" as const) : ("base" as const);
  const payTo = get("PAYOUT_WALLET_ADDRESS");
  if (!payTo) {
    console.error("PAYOUT_WALLET_ADDRESS is required when payments are on (or set MCP_PAYMENTS=off).");
    process.exit(1);
  }
  payment = await buildPaymentSetup({
    network,
    payTo,
    cdpApiKeyId: get("CDP_API_KEY_ID"),
    cdpApiKeySecret: get("CDP_API_KEY_SECRET"),
    facilitatorUrl: get("FACILITATOR_URL"),
  });
  console.log(`payments: ON (network=${network}, payTo=${payTo})`);
} else {
  console.log("payments: OFF (MCP_PAYMENTS=off — free allowance only)");
}

const freeAllowance = get("MCP_FREE_ALLOWANCE") !== "off";
if (!freeAllowance) console.log("free allowance: OFF (every paid tool call demands payment)");

const port = Number(get("MCP_PORT") ?? "3402");
const server = createMcpHttpServer({ origin, serviceKey, payment, freeAllowance });
server.listen(port, () => {
  console.log(`scrapecheck-mcp: streamable HTTP on :${port}/mcp, origin=${origin}`);
});
