# ScrapeCheck MCP — Verify Scraped Web Data Against Reality

**Verify what you scraped for the price of scraping it.** This MCP server
gives any agent a verification tool in its own toolbox: send a source URL,
the scraped field values, and what was asked — ScrapeCheck **re-fetches the
page itself** and returns an ed25519-signed verdict: `pass`, `fail`, or
`unverifiable`.

**Endpoint:** `https://scrapecheck-mcp.fly.dev/mcp` (streamable HTTP)
**Payment:** x402 in-band (USDC on Base) — no API key, no signup. A free
allowance per client identity is served before payment is required.

## Tools

| Tool | Price | What it certifies |
|---|---|---|
| `verify_web_field` | $0.01 | Full verification: value present on the re-fetched live page, served live, and an independent LLM judge confirms it answers what was asked. Positive verdict: `pass`. |
| `verify_presence` | $0.002 | Presence only — does **NOT** confirm the value answers the question. Positive verdict: `present`, never `pass`. |
| `get_verifier_info` | free | The trust artifact: public key, benchmark summary, scope, endpoints. |

## The trust guarantee is structural, not statistical

A claim is never certified unless ScrapeCheck independently re-fetches the
page and finds the claimed value there itself — and the judge's vote is
mechanically voided if its restatement of the claim doesn't match what was
actually claimed. Absence cannot pass, and substitution cannot pass. Anything
unconfirmed — a skipped check, a failed fetch, a judge that errors —
returns `unverifiable`, never `pass`.

Corroborated by benchmark (full verification only): **0 false passes across
67 frozen labeled cases** (26 held out from all calibration, including
adversarial traps where the claimed value appears on the page as the wrong
thing), and 0 false passes across 21 live-web cases including 9 adversarial
traps. Small-N corroboration of the structural guards — not a population
accuracy claim.

## Why trust this server's own claims?

Because you don't have to. Every verdict is ed25519-signed over canonical
sorted-key JSON of all fields except `signature`; the public key is served
at [`/pubkey`](https://scrapecheck.fly.dev/pubkey) and in-band via
`get_verifier_info`; and every verdict carries an engine digest identifying
exactly which prompt+calibration produced it. Verify offline — no need to
trust the transport, the storefront, or us.

## Payment flow (x402 in-band)

Standard `@x402/mcp` v2 flow: an unpaid call past the free allowance returns
a `PaymentRequired` challenge in the tool result; pay with any x402 v2
client (e.g. `wrapMCPClientWithPaymentFromConfig` from `@x402/mcp` with an
EVM signer) and the retried call returns the verdict plus the on-chain
settlement in `_meta["x402/payment-response"]`. A refused or failed payment
never yields a verdict, and a verdict that fails to produce never settles —
you are charged only for completed work.

## Integrator notes

- The full signed verdict object is in **`structuredContent`** on the wire
  (and byte-identical as JSON in `content[0].text`). Note: `@x402/mcp`'s
  paying-client convenience result forwards `content` only — parse
  `content[0].text` there, or read `structuredContent` with a plain MCP
  client.
- Input contract (frozen): `{ url, claim, asked }` — `claim` is an object of
  field values, e.g. `{"price": "£51.77", "in_stock": true}`.
- Scope (v1): server-rendered pages. Client-rendered (JS-only) content
  returns `unverifiable` — never a false `fail`, never a false `pass`.
- The same engine is also sold as a raw x402 HTTP API
  (`https://scrapecheck.fly.dev/verify`) and as the
  [Scrape QA Apify actor](https://apify.com/doting_grouper/scrape-qa) for
  batch dataset verification. One engine, one signing key, one durable log.

## Verify a verdict yourself (offline)

This repo ships a zero-dependency verifier — check any ScrapeCheck verdict
without trusting us, the transport, or this server:

```bash
node tools/verify-verdict.mjs examples/verdict.json --pubkey key.json
```

Omit `--pubkey` to fetch the current key from
[`/pubkey`](https://scrapecheck.fly.dev/pubkey); pass it (an `ed25519:…`
string or a saved `/pubkey` response) to verify fully offline.
[`examples/verdict.json`](examples/verdict.json) is a real production verdict
— alter any field and verification fails. A verdict is valid iff its ed25519
signature verifies over the canonical (recursively key-sorted) JSON of every
field except `signature`. MIT licensed — vendor the ~40 relevant lines into
your own pipeline freely.

## About this repository

This repo contains the thin MCP storefront only — transport, payment
handling, and tool registration. The verification engine (the anchored
re-fetch, the lenses, the judge, the signing key, and the benchmark
fixtures) runs at the ScrapeCheck origin and is not part of this codebase.
