import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createPaymentWrapper, MCP_PAYMENT_META_KEY } from "@x402/mcp";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { z } from "zod";
import type { PaymentSetup } from "./payment.js";

/**
 * ScrapeCheck MCP storefront (MCP_STOREFRONT_SPEC §3-4): a thin layer that
 * translates MCP tool calls into authenticated calls against the ScrapeCheck
 * origin. No verification logic lives here — the diamond, signing, guards,
 * and durable log are all the origin's. Requests carry x-service-channel: mcp
 * so they land in the durable log as channel "mcp".
 *
 * M2 payment model (x402 in-band via the official @x402/mcp wrapper):
 * - Unpaid call → the origin decides the free allowance (same tier as the
 *   public rail, counted against the forwarded caller IP). Origin 402 → the
 *   x402 PaymentRequired challenge goes back in-band.
 * - Paid call → the wrapper verifies the payment BEFORE the origin is called
 *   (no verdict on a failed or skipped payment) and settles AFTER the verdict
 *   returns (an origin refusal cancels settlement — charge only on completed
 *   work). The settled payer is forwarded for the durable log; it is used for
 *   logging and free-tier identity only, trusted for nothing else.
 */

export interface McpDeps {
  origin: string; // e.g. "https://scrapecheck.fly.dev"
  serviceKey: string;
  fetchImpl?: typeof fetch;
  /** The MCP caller's IP — forwarded to the origin as the free-tier identity. */
  clientIp?: string;
  /** x402 payment plumbing; absent → payments off (free allowance only). */
  payment?: PaymentSetup | null;
  /** Serve the free allowance before demanding payment (default true). */
  freeAllowance?: boolean;
}

export const SERVER_INFO = { name: "scrapecheck", version: "0.2.0" };

export const PRICES = { verify_web_field: 0.01, verify_presence: 0.002 } as const;

/** Mirrors the origin's frozen VerifyInputSchema (contract.ts) field-for-field. */
const verifyInputShape = {
  url: z.string().url().describe("URL of the source page the claim was scraped from"),
  claim: z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .describe('The scraped field(s) to verify against the live page, e.g. {"price": "£51.77", "in_stock": true}'),
  asked: z
    .string()
    .min(1)
    .describe('What the scraper was asked to extract, e.g. "get the current price and stock status"'),
};

/** The signed verdict passes through unmodified; extra fields are preserved. */
const verdictOutputSchema = z
  .object({
    verdict_id: z.string(),
    verdict: z.string(),
    confidence: z.number(),
    reasons: z.array(z.string()),
    evidence: z.object({}).passthrough(),
    check_type: z.string(),
    engine: z.string(),
    signature: z.string(),
  })
  .passthrough();

// Tool descriptions are listing copy — situation-first, negative signal
// early, reviewer-passed line-by-line (agent-facing brief, 2026-08-06).
export const DESCRIPTIONS = {
  verify_web_field: `Checks whether a value you did not fetch yourself is actually on the source page right now, and returns a signed pass/fail/unverifiable verdict. Not a retrieval tool: it checks a value you already have, it does not find data for you. Use it when you hold a value that came from somewhere else (a search result, a scraper, an upstream API, another agent) and you need to know it is on the source page before you act on it. Takes the URL, the claimed value, and what was asked; it independently re-fetches the page and never trusts the fetch you were given. Structural guarantee: a claim is never certified unless the re-fetched page contains it, and the model judge can only veto a pass, never create one. Anything unconfirmed returns unverifiable, never pass. Every verdict carries a stable verdict_id, the engine digest that produced it, and a signature verifiable offline against the public key (see get_verifier_info). Scope: server-rendered pages; JS-only content returns unverifiable rather than a guess. $0.01 per check, first 100 free, paid in-band via x402.`,
  verify_presence: `Presence only: confirms the value appears on the page, NOT that it is the right answer to what was asked. Never returns pass. A was-price, a different variant's price, a shipping cost, or a tax figure can all satisfy presence. Verdicts are present, fail, or unverifiable, signed, with check_type web_field_presence_v1. Use it as a cheap screen before a full check, or when you already know what the value means and only need to confirm it still appears on the page. If your decision depends on the value being the right value, call verify_web_field instead. Scope: server-rendered pages. $0.002 per check, paid in-band via x402.`,
  get_verifier_info: `Free. Returns the public key, engine version, benchmark summary with sample-size labels, and scope, so you can verify any verdict offline. Call this first if your selection policy requires evidence before trusting a verification provider: every verdict this service issues verifies offline against the returned key, so you do not have to trust the service at runtime to rely on its output.`,
} as const;

/**
 * Sentence-boundary truncation for short surfaces (the 402 challenge's
 * resource.description). An arbitrary character slice through a guarantee
 * can leave a claim standing without its qualifier — mid-word cuts published
 * an overclaim risk on a payment surface. This emits only complete
 * sentences within the cap. Pinned by test; truncation is not authorship.
 */
export function truncateAtSentenceBoundary(text: string, cap = 300): string {
  if (text.length <= cap) return text;
  for (let i = cap; i > 0; i--) {
    const ch = text[i - 1];
    if ((ch === "." || ch === "!" || ch === "?") && (i >= text.length || text[i] === " ")) {
      return text.slice(0, i);
    }
  }
  return text.slice(0, cap); // unreachable for our copy; pinned by test
}

// From the reviewer-approved README (full-verification only; small-N labels
// are part of the claim and must travel with the numbers).
const BENCHMARK_SUMMARY =
  "0 false passes across 67 frozen labeled cases (26 held out from all calibration, including adversarial traps " +
  "where the claimed value appears on the page as the wrong thing), and 0 false passes across 21 live-web cases " +
  "including 9 adversarial traps. Small-N corroboration of the structural guards — not a population accuracy claim. " +
  "Applies to full verification (verify_web_field) only.";

const SCOPE_STATEMENT =
  "Server-rendered pages. Client-rendered (JS-only) content returns \"unverifiable\" — never a false \"fail\", " +
  "never a false \"pass\". One set of claimed fields per row. Anything unconfirmed — a skipped check, a failed " +
  "fetch, a judge that errors — returns \"unverifiable\", never \"pass\".";

type VerifyArgs = { url: string; claim: Record<string, string | number | boolean>; asked: string };
type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
};

/** Settled payer address from a v2 ExactEvm payment payload (logging identity only). */
function payerFrom(paymentPayload: { payload?: Record<string, unknown> } | undefined): string | undefined {
  const payload = paymentPayload?.payload as { authorization?: { from?: string }; payer?: string } | undefined;
  const candidate = payload?.authorization?.from ?? payload?.payer;
  return typeof candidate === "string" && /^0x[0-9a-fA-F]{40}$/.test(candidate) ? candidate : undefined;
}

export async function buildMcpServer(deps: McpDeps): Promise<McpServer> {
  const doFetch = deps.fetchImpl ?? fetch;
  const freeAllowance = deps.freeAllowance !== false;

  const server = new McpServer(SERVER_INFO);

  const callOrigin = async (
    path: "/verify" | "/verify-presence",
    args: VerifyArgs,
    identity: { payer?: string },
  ): Promise<{ ok: true; verdict: Record<string, unknown> } | { ok: false; status: number; error: string }> => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-service-key": deps.serviceKey,
      "x-service-channel": "mcp",
    };
    if (identity.payer) headers["x-forwarded-payer"] = identity.payer;
    else if (deps.clientIp) headers["x-forwarded-client-ip"] = deps.clientIp;
    const res = await doFetch(`${deps.origin}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(args),
    });
    const text = await res.text();
    if (res.status !== 200) {
      // Origin refusals (contract 400, SSRF, caps) surface verbatim as tool
      // errors — never re-shaped into anything verdict-like.
      return { ok: false, status: res.status, error: `origin returned ${res.status}: ${text.slice(0, 500)}` };
    }
    return { ok: true, verdict: JSON.parse(text) as Record<string, unknown> };
  };

  const okResult = (verdict: Record<string, unknown>): ToolResult => ({
    content: [{ type: "text", text: JSON.stringify(verdict, null, 2) }],
    structuredContent: verdict,
  });
  const errResult = (message: string): ToolResult => ({
    isError: true,
    content: [{ type: "text", text: message }],
  });

  const registerPaidTool = async (name: "verify_web_field" | "verify_presence", path: "/verify" | "/verify-presence") => {
    // Per-instance payer capture: servers are built per request (stateless
    // HTTP) or per linked pair (tests), so this cannot bleed across callers.
    let settledPayer: string | undefined;

    // deno-lint-ignore no-explicit-any
    let paidHandler: ((args: VerifyArgs, extra: unknown) => Promise<ToolResult>) | null = null;
    if (deps.payment) {
      const accepts = await deps.payment.acceptsFor(PRICES[name]);
      const paid = createPaymentWrapper(deps.payment.resourceServer, {
        accepts,
        resource: {
          url: `mcp://tool/${name}`,
          description: truncateAtSentenceBoundary(DESCRIPTIONS[name], 300),
          serviceName: "ScrapeCheck",
          tags: ["verification", "scraping", "data-quality", "signed-verdicts"],
        },
        // Bazaar discovery (same extension as the HTTP rail, MCP variant): a
        // REAL, working example — the quality crawler exercises the declared
        // input, and a fictional URL would read as a broken service.
        extensions: {
          ...declareDiscoveryExtension({
            toolName: name,
            description: truncateAtSentenceBoundary(DESCRIPTIONS[name], 300),
            inputSchema: {
              type: "object",
              properties: {
                url: { type: "string", description: "source page the scraper claims to have read (public http/https)" },
                claim: { type: "object", description: "the scraper's claimed field values" },
                asked: { type: "string", description: "the original request, plain text" },
              },
              required: ["url", "claim", "asked"],
            },
            output: {
              example:
                name === "verify_web_field"
                  ? {
                      verdict_id: "965abecd-a85f-45c7-98a2-49bde4bb9c51",
                      verdict: "pass",
                      confidence: 0.97,
                      reasons: ['claimed price £51.77 found in re-fetched page; page shows "in stock"'],
                      check_type: "web_field_v1",
                      engine: "web_field_v1/0.2.0+2ae28205cac4",
                      signature: "ed25519:…",
                    }
                  : {
                      verdict_id: "0d2c1a44-9a01-4a30-8c11-3a1f4f2f9b21",
                      verdict: "present",
                      confidence: 0.9,
                      reasons: [
                        "claimed price £51.77 found in re-fetched page",
                        "presence check only: confirms the value appears on the live page — not that it answers the question",
                      ],
                      check_type: "web_field_presence_v1",
                      signature: "ed25519:…",
                    },
            },
          }),
        },
        hooks: {
          onBeforeExecution: async ({ paymentPayload }) => {
            settledPayer = payerFrom(paymentPayload as { payload?: Record<string, unknown> });
            return true;
          },
        },
      });
      // Inside the wrapper: payment is already VERIFIED; the origin call runs
      // with the payer identity; an origin refusal returns isError, which
      // makes the wrapper cancel settlement (charge only on completed work).
      paidHandler = paid(async (args: VerifyArgs) => {
        const result = await callOrigin(path, args, { payer: settledPayer });
        return result.ok ? okResult(result.verdict) : errResult(result.error);
      }) as unknown as (args: VerifyArgs, extra: unknown) => Promise<ToolResult>;
    }

    server.registerTool(
      name,
      {
        title: name === "verify_web_field" ? "Verify scraped claim (full)" : "Presence check (not an answer check)",
        description: DESCRIPTIONS[name],
        inputSchema: verifyInputShape,
        outputSchema: verdictOutputSchema.shape,
        // MCP tool annotations (all four hints, honestly set):
        // - readOnly: verification never modifies anything the caller owns
        // - not idempotent BY DESIGN: the live page can change between calls,
        //   so two identical calls can honestly return different verdicts
        // - openWorld: each call re-fetches an arbitrary public web page
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      (async (args: VerifyArgs, extra: { _meta?: Record<string, unknown> } | undefined) => {
        const hasPayment = extra?._meta?.[MCP_PAYMENT_META_KEY] != null;

        if (!hasPayment) {
          if (freeAllowance) {
            // The ORIGIN owns the allowance decision (same caps as the public
            // rail, counted against the forwarded caller IP).
            const result = await callOrigin(path, args, {});
            if (result.ok) return okResult(result.verdict);
            if (result.status !== 402) return errResult(result.error);
            // Allowance exhausted → fall through to the payment challenge.
          }
          if (!paidHandler) return errResult("free allowance exhausted and payments are not enabled on this storefront");
          return paidHandler(args, extra); // no payment attached → in-band 402 PaymentRequired
        }

        if (!paidHandler) return errResult("payments are not enabled on this storefront");
        return paidHandler(args, extra); // verify → origin → settle
      }) as never,
    );
  };

  await registerPaidTool("verify_web_field", "/verify");
  await registerPaidTool("verify_presence", "/verify-presence");

  server.registerTool(
    "get_verifier_info",
    {
      title: "Verifier trust info (free)",
      description: DESCRIPTIONS.get_verifier_info,
      inputSchema: {},
      // Idempotent: same trust artifact modulo the live health bit; closed
      // world: only ever talks to our own origin, never the open web.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      // Guarded: an origin outage must surface as a clean tool error, not an
      // unhandled rejection bubbling up as a raw MCP failure.
      let pubkeyRes: Record<string, unknown>;
      let healthRes: Record<string, unknown>;
      try {
        [pubkeyRes, healthRes] = await Promise.all([
          doFetch(`${deps.origin}/pubkey`).then((r) => r.json() as Promise<Record<string, unknown>>),
          doFetch(`${deps.origin}/healthz`)
            .then((r) => r.json() as Promise<Record<string, unknown>>)
            .catch(() => ({ ok: false as const })),
        ]);
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `origin unreachable: ${e instanceof Error ? e.message : String(e)}. The public key is also served at ${deps.origin}/pubkey.`,
            },
          ],
          isError: true,
        };
      }
      const info = {
        service: "ScrapeCheck",
        ...pubkeyRes, // { algorithm, public_key }
        signature_scheme:
          'ed25519 over canonical (recursively sorted-key) JSON of every verdict field except "signature"',
        benchmark: BENCHMARK_SUMMARY,
        scope: SCOPE_STATEMENT,
        pricing: { verify_web_field_usd: PRICES.verify_web_field, verify_presence_usd: PRICES.verify_presence },
        payment: "x402 in-band (Base USDC); a free allowance per client identity is served before payment is required",
        endpoints: {
          pubkey: `${deps.origin}/pubkey`,
          healthz: `${deps.origin}/healthz`,
        },
        origin_healthy: healthRes.ok === true,
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(info, null, 2) }],
        structuredContent: info,
      };
    },
  );

  return server;
}
