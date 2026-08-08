# ScrapeCheck MCP — Verify Scraped Web Data Against Reality

**Verify what you scraped for the price of scraping it.** This MCP server
gives any agent a verification tool in its own toolbox: send a source URL,
the scraped field values, and what was asked — ScrapeCheck **re-fetches the
page itself** and returns an ed25519-signed verdict: `pass`, `fail`, or
`unverifiable`.

**Endpoint:** `https://scrapecheck-mcp.fly.dev/mcp` (streamable HTTP)
**Payment:** x402 in-band (USDC on Base) — no API key, no signup. A free
allowance per client identity is served before payment is required.

**Check us yourself — the three things you can attack:**
[verify any verdict offline](#verify-a-verdict-yourself-offline) · [live run stats, misses included](https://scrapecheck.fly.dev/stats) · [the benchmark and its limits](#the-trust-guarantee-is-structural-not-statistical)

## Tools

- `verify_web_field` — $0.01 — Full verification: value present on the re-fetched live page, served live, and an independent LLM judge confirms it answers what was asked. Positive verdict: `pass`.
- `verify_presence` — $0.002 — Presence only — does **NOT** confirm the value answers the question. Positive verdict: `present`, never `pass`.
- `get_verifier_info` — free — The trust artifact: public key, benchmark summary, scope, endpoints.

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

Live, unfiltered run stats — misses included:
[scrapecheck.fly.dev/stats](https://scrapecheck.fly.dev/stats). A verifier
that only shows its passes isn't showing anything.

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
  [Scrape QA Apify actor](https://apify.com/fieldmodellc/scrape-qa) for
  batch dataset verification. One engine, one signing key, one durable log.

## Verify a verdict yourself (offline)

This repo ships a zero-dependency verifier — check any ScrapeCheck verdict
without trusting us, the transport, or this server:

```console
$ node tools/verify-verdict.mjs examples/verdict.json
(public key fetched from https://scrapecheck.fly.dev/pubkey — pass --pubkey to verify fully offline)
VALID: signature verifies against the public key
  verdict:    pass (confidence 0.97)
  verdict_id: 7af5f1df-1b86-42a5-a784-9b302a55f94e
  check_type: web_field_v1
  engine:     web_field_v1/0.2.0+2ae28205cac4
$ echo $?
0

# flip a single field — "verdict": "pass" -> "fail" — and run it again
$ node tools/verify-verdict.mjs tampered.json
(public key fetched from https://scrapecheck.fly.dev/pubkey — pass --pubkey to verify fully offline)
INVALID: signature does not verify — the verdict was altered or was not signed by this key
$ echo $?
1
```

Omit `--pubkey` to fetch the current key from
[`/pubkey`](https://scrapecheck.fly.dev/pubkey); pass it (an `ed25519:…`
string or a saved `/pubkey` response) to verify fully offline.
[`examples/verdict.json`](examples/verdict.json) is a real production verdict
— alter any field and verification fails. A verdict is valid iff its ed25519
signature verifies over the canonical (recursively key-sorted) JSON of every
field except `signature`. MIT licensed — vendor the ~40 relevant lines into
your own pipeline freely.

### Envelope fields added August 2026

New verdicts carry three additional signed fields. `key_id` names which key
in the /pubkey archive signed the verdict; it is advisory — the signature
either verifies against a published key or it doesn't — and a mismatch
between the claim and the verifying key is surfaced as a warning.
`verifier_url` is the canonical origin for /pubkey and /verdicts lookups;
it is a pointer home, never a trust root — a verifier must not fetch keys
from a URL the document itself supplies, so ours pins the known origin and
uses the embedded value only for display and mismatch warnings.
`source_hash` is the SHA-256 of the normalized page text the verdict
actually judged, a fingerprint of the page state at refetched_at. Hash
equality is meaningful between verdicts carrying the same engine digest;
across digests it is best-effort only, and today it is comparable
verdict-to-verdict rather than independently recomputable. Verdicts issued
before these fields existed verify exactly as before.

## Key rotation, August 2026

On 6 August 2026 the ed25519 signing key was treated as exposed: an operator
error placed a credentials file into an external chat channel. Under our own
doctrine — a key that has touched an untrusted channel is compromised whether
or not anyone used it — the key was rotated the same day.

No verdict was affected. Signatures cover the verdict payload, so verdicts
issued before the rotation are unchanged and still verify against the retired
key, which is published permanently as `k1` at
[`/pubkey`](https://scrapecheck.fly.dev/pubkey). Verdicts issued afterwards are
signed with `k2`. The offline verifier tries every published key and reports
which one matched.

**If you hold a verdict signed by `k1`, confirm it.** A valid signature from a
retired key proves that key signed the verdict — not that we issued it, because
anyone holding the exposed private key can sign anything, including a forgery
that reuses a real verdict_id. So we publish an issuance record:

    GET https://scrapecheck.fly.dev/verdicts/<verdict_id>

It returns whether we issued that id and, where available, `signature_sha256`
— the SHA-256 of the signature we issued under it. ed25519 is deterministic,
so hashing the signature on your copy and comparing binds your verdict's exact
content to ours. Match means it is the verdict we issued — the same signed
content. Mismatch means forged content under a real id. The endpoint returns no verdict content, no
client data, and nothing enumerable. Running the verifier without `--pubkey`
performs this check for you automatically on any `k1`-signed verdict.

**One honest limitation.** Signature hashes were not logged before 6 August
2026, so for most pre-rotation verdicts we can confirm issuance but cannot bind
content; those return `content_binding: "unavailable_legacy"`, and the verifier
reports `PARTIAL` rather than confirming. Where we can bind a pre-rotation
verdict from an artifact published before the exposure — the example verdict in
this repository, whose signature is fixed in public git history that no forger
can rewrite — the record says so and labels the provenance. Bindings recovered
from artifacts we merely retained privately are labeled
`available_backfilled`, because a binding is only as good as the provenance of
the artifact behind it. Every pre-rotation verdict was issued to ourselves; no
external customer holds one.

**A commitment that follows.** Because the issuance record is public, a logged
verdict can never be deleted. Reporting `issued: false` about a verdict we
really signed would be a lie about our own history, so retention is now part of
the trust contract rather than an operational preference.

What the exposure meant: a holder of the old private key could produce forged
verdicts that verify against the old public key. They could not alter any
verdict already issued, and the key gave no access to the service, its logs, or
any funds. No forged verdict has been observed.

This is the procedure working as designed, and it is written down here because
a verifier that hides its own incidents is not a verifier.

## About this repository

This repo contains the thin MCP storefront only — transport, payment
handling, and tool registration. The verification engine (the anchored
re-fetch, the lenses, the judge, the signing key, and the benchmark
fixtures) runs at the ScrapeCheck origin and is not part of this codebase.
