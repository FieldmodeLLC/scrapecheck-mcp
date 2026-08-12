#!/usr/bin/env node
/**
 * The worked example from "Your Actor's input schema is the function
 * signature an AI agent sees" — an agent reads a page with one Apify Actor,
 * extracts values itself, then checks its own extraction with another.
 *
 * Both Actors are called through the Apify MCP server, unattended. Neither
 * takes a code-string input, so neither hits the full-permission approval
 * gate that stops an agent cold.
 *
 * Source is books.toscrape.com on purpose: server-rendered, and it answers
 * datacenter IPs, so you get the same result the article got instead of a
 * bot wall.
 *
 * Run:
 *   npm install @modelcontextprotocol/sdk
 *   APIFY_TOKEN=your_token node examples/agent-verification-demo.mjs
 *
 * MIT License — see LICENSE.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const TOKEN = process.env.APIFY_TOKEN;
if (!TOKEN) {
  console.error("set APIFY_TOKEN (Apify Console → Settings → Integrations)");
  process.exit(1);
}

const PAGE = "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html";
const CRAWLER = "apify--website-content-crawler";
const CHECKER = "fieldmodellc--scrape-qa";

/** Apify's MCP layer returns run summaries as text; pull the dataset id out. */
function datasetIdFrom(text) {
  return text.match(/datasetId=([A-Za-z0-9]{10,})/)?.[1] ?? null;
}

function textOf(result) {
  return (result.content ?? []).map((c) => c.text ?? "").join("\n");
}

const url = new URL("https://mcp.apify.com/");
// The documented parameter for pre-selecting Actors as tools.
url.searchParams.set("tools", "apify/website-content-crawler,fieldmodellc/scrape-qa");

const client = new Client({ name: "agent-verification-demo", version: "1.0.0" });

try {
  await client.connect(
    new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    }),
  );

  // What the agent can see: name, description, input schema. Nothing else.
  const { tools } = await client.listTools();
  console.log(`tools available: ${tools.map((t) => t.name).join(", ")}\n`);

  // ── 1. read the page ────────────────────────────────────────────────────
  // proxyConfiguration is REQUIRED by this Actor's schema, and an object of
  // the right shape is not enough: { useApifyProxy: false } with no proxy
  // urls is schema-valid and semantically empty, and the Actor says so.
  const crawl = await client.callTool({
    name: CRAWLER,
    arguments: {
      startUrls: [{ url: PAGE }],
      crawlerType: "cheerio",
      maxCrawlDepth: 0,
      maxResults: 1,
      proxyConfiguration: { useApifyProxy: true },
    },
  });
  const crawlDataset = datasetIdFrom(textOf(crawl));
  if (!crawlDataset) throw new Error(`no dataset id from the crawler: ${textOf(crawl).slice(0, 300)}`);
  console.log(`1. crawled the page → dataset ${crawlDataset}`);

  // ── 2. fetch what it just crawled ───────────────────────────────────────
  const fetched = await client.callTool({
    name: "get-dataset-items",
    arguments: { datasetId: crawlDataset, limit: 1, fields: "url,metadata.title,text" },
  });
  const pageText = textOf(fetched);

  // ── 3. the agent's own reading — the claim that needs checking ──────────
  const title = pageText.includes("A Light in the Attic") ? "A Light in the Attic" : null;
  const price = pageText.match(/£\s?\d+\.\d{2}/)?.[0]?.replace(/\s/g, "") ?? null;
  console.log(`2. extracted: title=${JSON.stringify(title)} price=${JSON.stringify(price)}`);
  if (!title || !price) throw new Error("extraction failed; the page may have changed");

  // ── 4. check the reading against the live source ───────────────────────
  // `items` rather than `datasetId`: the agent is holding the values itself.
  const check = await client.callTool({
    name: CHECKER,
    arguments: {
      items: [{ url: PAGE, title, price }],
      mode: "full",
      autoMap: true,
      maxChecks: 1,
    },
  });
  const verdictDataset = datasetIdFrom(textOf(check));
  if (!verdictDataset) throw new Error(`no dataset id from the checker: ${textOf(check).slice(0, 300)}`);

  const rows = await client.callTool({
    name: "get-dataset-items",
    arguments: { datasetId: verdictDataset, limit: 1 },
  });
  const row = JSON.parse(textOf(rows).split("\n")[0]).items[0];

  console.log(`3. verdict: ${row.verdict} (confidence ${row.confidence})`);
  for (const reason of row.reasons ?? []) console.log(`   - ${reason}`);
  console.log(`\nthe signed envelope is in row.signed_verdict — verify it with:`);
  console.log(`   node tools/verify-verdict.mjs <(echo '${"{"}"signed_verdict": …${"}"}')`);
  console.log(`or point the verifier at a whole dataset export, which it reads directly.`);
} catch (err) {
  console.error(`failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
