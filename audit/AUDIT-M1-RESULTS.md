# Audit M1 — run log and results

## Run 1 (2026-08-15): NONE-FOUND under protocol v1, $0.00 spent

The frozen protocol executed exactly as written and found no eligible
dataset. Full log:

Pool 1 (Hugging Face datasets API, no login):
- "scraped products" → 0 results
- "ecommerce scraped" → 0 results
- "product prices scraped" → 0 results
- Instrument check (allowed: own code is the first instrument): the API
  works and multi-word queries CAN return results ("amazon products" →
  8), and single-token queries return plenty ("scraped" → 8+,
  "ecommerce" → 8+). Conclusion: HF search matches dataset NAMES, not
  descriptions or contents; the v1 queries assumed full-text search
  that does not exist. The zeros are honest answers to the wrong-shaped
  questions.

Pool 2 (GitHub repository search, no login):
- "scraped product dataset price url" sort=updated → 3 results total:
  1. DS-112 (updated 2026-06-30): REJECTED — repo
     tree contains zero data files (scraper code, no dataset).
  2. DS-251 (2026-06-02):
     REJECTED — zero data files.
  3. DS-015
     (2025-08-31): REJECTED — outside the 90-day freshness window, and
     provenance is the Books to Scrape training sandbox (a toy, not a
     real artifact class).

Stop rule applied verbatim: "If neither pool yields an eligible
dataset, the run stops and reports none-found as its finding. No third
pool is improvised."

## What run 1 taught (the pilot doing its job on its first failure)

The failure mode is in the SEARCH LAYER, not the universe: the
instrument check proves scraped e-commerce datasets exist on the hub;
v1's multi-word name queries could not see them. This is the Bazaar
MCP-search lesson replaying on a different registry: search surfaces
match names, and query shape is part of the method. Protocol v2
(drafted in AUDIT-M1-PREREG.md, AWAITING PASS) uses single-token
queries with client-side eligibility evaluation, which is what this
registry's search actually supports.

Spend against the $25 cap: $0.00 (no engine checks were run; the run
never reached sampling).

## Run 2 (2026-08-15, protocol v2 as passed with the guard's frozen
## eligibility): DATASET SELECTED

Pool 1 (HF, single-token queries, client-sorted, 43 fresh public
candidates evaluated in order): ALL REJECTED with logged reasons —
DS-209 (provenance: card documents no scraper,
method, or dates), DS-118 (no row-level
source URLs; synthetic extraction data), and the 41-dataset
PUB-009 family (class rejection, confirmed on three members:
canonical_url is the publisher's own index page, not the scraped
source — verifying there measures their republication, not source
decay).

Pool 2 (GitHub, query "scraped dataset price", returned order):
DS-459 (no data files), PUB-063 CodeAlpha
repo (no data files), then —

**ACCEPTED: DS-259** (updated 2026-08-15).
Git-scraping archive of US hospital price transparency machine-readable
files (45 CFR § 180.50), dozens of source directories in the tree (exact count recorded privately), each with meta.json carrying the
source mrf_url, sha256, source_last_modified, first_seen/last_changed,
plus jsonl shards of parsed rows. Eligibility walk: row-level source
URL via the documented 1:1 hospital-to-mrf_url join; concrete claimed
values (standard_charge_dollar per code/payer/plan); provenance
documented in the README (method, scope, legal context); public, no
login; fresh; age recorded per snapshot (git history + meta fields —
the best-instrumented candidate possible on this criterion).
Server-rendered spot check per the frozen rule, first three hospitals
by sha256(dir): SRC-005 206 application/zip, SRC-001 fetch
timeout, SRC-009 206 text/csv. MAJORITY READABLE = eligible;
the timeout and the zip are coverage facts, not rejections.

### Sampling implementation (documented BEFORE any check ran)

The prereg's sha256(row_url) rule assumed distinct per-row URLs; here
every row in a hospital shares one mrf_url, so the rule is implemented
as a stratified deterministic sample, spirit intact, letter adapted:
hospitals ordered by sha256(directory name) ascending; within each
hospital, its first shard file (lexicographic); within the shard, rows
ordered by sha256(canonical row JSON) ascending; TWO rows per hospital
until 100 rows. Rows without any extractable dollar value are skipped
and counted. No re-rolls at any stage.

DISCLOSED BIAS, flagged for the full pass: first shards hold the head
of each source file, and a server-side fetch window also reads from the
head — so this sample is KINDER than a uniform-random sample would be.
Acceptable for M1 (method + cost hardening); M2's design must handle
depth-of-file deliberately.

Claim construction per row: claim = the row's first
standard_charge_dollar (string, as the file carries it); asked names
the code, description, payer, and plan. Engine checks via the audit
channel, one per row, results appended here after the run.

## Run 2 RESULTS (completed 2026-08-15; row-level record in
## audit-m1-rows.jsonl, every row carrying a signed verdict id)

**Sample: 28 rows from the sharded subset — not 100.** Only a fraction of the archive's source directories store parsed rows as jsonl shards; the run
script sampled the sharded subset only. Implementation narrowness,
recorded: the archive's other storage formats (unsharded/raw) need
handling in any M2. Additionally nearly all parsed first-shard rows
carried NO flat dollar value (percentage-based and algorithm-based
charges dominate hospital MRFs) — claim extractability is its own
coverage dimension and now has a number.

**Verdict mix: 28 unverifiable, 0 pass, 0 fail. Coverage KPI: 0 of 28
rows addressable (0%).** Reasons, from the signed verdicts: most: ANCHOR_BODY_TOO_LARGE (the source MRF exceeds the engine's fetch-size
cap — these files run to tens of MB), the rest: ANCHOR_HTTP_STATUS (source
refused or failed the re-fetch). The engine said "we could not read
this, so we will not attest anything" 28 times and signed each one —
the doctrine at population scale.

**Spend: effectively $0.00 against the $25 cap.** Every check
short-circuited at the anchor fetch before any AI-judge invocation, so
the run consumed no judge tokens; a billing-delta for a run of this
shape sits below measurement noise. Consequence recorded honestly: the
pilot produced a COVERAGE number, not a COST number — cost-per-1,000-
rows requires addressable rows and remains an open deliverable.

## What the pilot proved (method + findings)

1. The pipeline works end to end: frozen search → in-order eligibility
   → deterministic sampling → signed verdicts → computed mix, with
   zero selection judgment anywhere.
2. Three failure modes surfaced and documented: registry search
   matches names not contents (run 1); dataset-internal storage
   heterogeneity (a fraction sharded); and source-class hostility to a
   bounded server-side fetch (most too large).
3. The honest headline candidate, stated within the claim ceiling: of
   the sampled rows across the archive's federally mandated
   transparency files, our server-side vantage could independently
   attest ZERO — most because the published files are too large for a
   bounded fetch, the rest because the source refused the request. This is a
   statement about OUR instrument's honest limits AND about the
   practical verifiability of this artifact class; any publication
   wording is a separate future gate.

## Run 3 (2026-08-15, v3 pools under amendment 2.1): COMPLETE — the
## pilot has its numbers

Selection: Kaggle pool A proved fully open (listing AND download work
with no account — the no-login rule let it through rather than emptying
it). First candidate in the fixed order:
**DS-301** (updated 2026-08-14), a
structured scrape of SRC-004 texts from HOST-007; several thousand rows carry a distinct http source URL and a page-title claim; named
platform provenance; page-shaped sources, as the v3 ruling predicted.
2.1 spot check: 3 of 3 rows ENGINE-ADDRESSABLE (anchor completed,
judge ran, verdicts signed) — dataset ACCEPTED. Spot-check rows are
rows 1-3 of the sample ordering; their verdicts count as-is, no
re-roll.

**RESULTS (100 rows: 3 spot + 97 run; row records in
audit-m1-run3-rows.jsonl, every row signed):**
- **Coverage KPI: 100/100 addressable (100%).** Page-shaped sources
  dissolved run 2's size-cap wall completely.
- **Verdict mix: 37 pass / 63 fail / 0 unverifiable.**
- Confidence distribution: fails cluster at 0.46, passes at 0.97-0.98.
- Characterization (ONE row read, no re-roll, stated at sample
  strength only): the failing row's URL resolves to a REAL page of the
  same site and same book but a DIFFERENT chapter — the dataset's
  titles do not live at the dataset's URLs. The other fails carry the
  same reason shape (claimed title vs different page content). Whether
  this is source-side restructuring or the dataset's own URL
  construction (its xref_url column is visibly malformed) is NOT
  determined; what is signed is that 63% of sampled rows' claims are
  not on their pages today. This is precisely the defect class a data
  buyer cannot see without independent re-verification.

**Spend: ~100 judge-backed checks ≈ $0.21 ESTIMATED from per-check
rates ($0.0021/check); a billing-delta this small sits below
measurement noise, recorded as an estimate and flagged — M2 needs a
billing-delta measurement plan sized to a run large enough to read.
Cap remaining: effectively the full $25.**
**Cost-per-1,000-rows, first estimate: ~$2.10 (judge fees only,
excludes Fly egress; label travels with the number).**

## Pilot CLOSED — every deliverable produced

1. Method proven end to end across three runs, zero silent errors, two
   instructive failures (registry search shape; addressability), each
   caught by its own tripwire.
2. Coverage KPI: defined, measured twice (0% hostile class, 100%
   page class) — the KPI discriminates, which is what a KPI is for.
3. Cost: first estimate on record with its honest label.
4. Verdict mix on a real public dataset: 37/63/0 — a finding with a
   story (the 63% misalignment class).
5. M2 go/no-go: GO on page-shaped pools, with depth-of-file design,
   dataset-count scaling (many datasets × fewer rows each beats one
   dataset × many rows for a benchmark), and the billing-delta plan as
   the design inputs. M2 scope doc is the next artifact, gated on the
   reviewer.

## RULINGS ON THE PILOT (reviewer, 2026-08-15; locked here so the
## number travels with its discipline)

1. THE FRAMING THAT SURVIVES SCRUTINY, verbatim: the honest metric is
   "fraction of rows whose claims could not be independently confirmed
   at their stated URLs today" — deliberately silent on cause. The
   malformed xref_url means source-side drift and dataset-side URL
   construction cannot be distinguished, and both causes are the same
   product thesis: the buyer inherits 63 rows per hundred that don't
   check out, and no amount of reading the dataset itself would have
   revealed it. The benchmark measures the BUYER'S RISK, not the
   seller's blame.
2. THE NOT-PUBLISHABLE WALL STANDS AT FULL HEIGHT: 63% is the most
   marketable number this company has produced, which is precisely why
   it does not leave the building — one dataset, one sample,
   pilot-grade method. It becomes publishable when M2 reproduces the
   measurement at benchmark strength. The wall is what will make the
   eventual number worth citing.
3. Confidence bimodality (fails 0.46, passes 0.97-0.98, nothing
   between) is diagnostic gold — the judge is not hedging — and rides
   into M2's design as a first-class reported diagnostic.

## M2 go/no-go: reviewer's call, three shaped options

(a) Engine range/streaming fetch for large sources — a GATED engine
change, sized before any commitment; (b) add addressable-by-vantage to
dataset eligibility and re-run selection — a RULING, since it changes
what the benchmark measures (data decay among what we can read, stated
as such); (c) treat the coverage finding itself as the publishable
seed. This file + the prereg travel to the reviewer as the one relay
for the full pass.
