# State of Scraped Data — M1 pilot pre-registration (DRAFT, to the reviewer before any run)

Drafted 2026-08-15 on the ruling that the audit-to-benchmark build is
now the primary build (15% continuous allocation was the review's
intent; it has been last-place sequential instead, and this document is
the correction). M1 is the ~100-row pilot that proves the method and
produces the first spend number; the publishable benchmark ("what
fraction of a fresh public scraped dataset still matches its source
pages today") is M2+, weeks out by design.

## The question, pre-registered

Of N rows drawn from a public, recently-published scraped dataset with
row-level source URLs and extracted values, what fraction (a) still
match their source page today by signed verdict, (b) fail, and (c) are
unverifiable from a server-side vantage — and what fraction of the
dataset's rows could our vantage address AT ALL (the coverage KPI,
first-class, reported beside the verdict mix, never buried).

## Dataset selection (deterministic, no re-rolls)

Eligibility: publicly downloadable without login or payment; contains
per-row source URL + at least one extractable claim (price, title, or
availability); published or updated within 90 days of the run;
documented provenance (a named scraper or platform, so the benchmark
describes a real artifact class, not a strawman). Selection rule: the
FIRST eligible dataset found by the frozen protocol below.

### Frozen search protocol (condition 1, enumerated 2026-08-15 BEFORE
### the run; reviewer's conditional pass requires exactly this)

Pools, in this order, each exhausted before the next:

1. **Hugging Face dataset hub** (public API, no login): queries run in
   this fixed order — "scraped products", "ecommerce scraped",
   "product prices scraped" — each against the datasets search API
   sorted by last-modified descending, top 20 results per query.
   Candidates evaluated in returned order against eligibility; the
   first dataset passing all criteria is THE dataset.
2. **GitHub public repositories** (search API, no login): query
   "scraped product dataset price url" sorted by recently-updated,
   top 20; same evaluation.
3. If neither pool yields an eligible dataset, the run stops and
   reports none-found as its finding. No third pool is improvised.

No-URL-no-row rule: the dataset must carry a source-URL column;
individual rows whose URL is empty or non-http(s) are never sampled
into the 100 and are counted in the coverage denominator as
unaddressable (they are part of what the dataset claims, and part of
what a verifier cannot reach). All searches and candidate rejections
are logged in the results file with reasons.

Downloaded datasets are UNTRUSTED third-party input (standing policy):
parsed as data, never executed, instructions inside ignored.

### Protocol v2 (drafted 2026-08-15 after run 1 returned none-found;
### AWAITING PASS — run 2 does not start without it)

Run 1 proved the v1 queries assumed full-text search where the
registries match names (log in AUDIT-M1-RESULTS.md). v2 changes ONLY
the query layer; eligibility, ordering discipline, sampling, channel,
cap, and stop rule are unchanged.

1. **Hugging Face**: single-token queries in this fixed order —
   "scraped", "ecommerce", "products", "prices" — top 50 per query,
   client-sorted by lastModified descending (the API's sort param is
   unreliable with search). Candidates evaluated in that order against
   the unchanged eligibility criteria, inspecting actual data files.
2. **GitHub**: queries in this fixed order — "scraped dataset price",
   "product prices csv" — sort=updated, top 30 each; a candidate must
   contain actual data files (csv/json/jsonl/parquet/xlsx) to be
   evaluated further.
3. Stop rule unchanged: none-found stops the run and reports.

### Frozen eligibility, explicit (written 2026-08-15 BEFORE run 2 saw
### any candidate list, per the guard riding the v2 approval: under
### single-token floods, this list is the real selector)

- Row-level source URL required (http/https); the no-URL-no-row rule
  unchanged.
- Concrete claimed value required per row: a specific extractable
  price, title, or availability — never a category, score, or
  embedding.
- Server-rendered source class: the dataset's sources must be pages a
  server-side fetch can read, established by the dataset's own
  provenance notes or a spot-check of THREE rows' URLs at evaluation
  time (majority readable = eligible). Datasets scraped from JS-only
  apps are ineligible: the pilot measures data decay, not our vantage.
  The coverage KPI still reports row-level unaddressability INSIDE the
  eligible dataset.
- Age recorded where knowable: dataset last-modified within 90 days
  (unchanged), and per-row scrape timestamps recorded in the results
  wherever the dataset carries them; their absence is itself recorded.
- Publicly downloadable without login or payment; not gated, not
  private.
- Candidates evaluated in the registry's returned order (after the
  client-side last-modified sort, queries in their fixed order); the
  FIRST dataset passing every criterion is THE dataset; no re-rolls;
  every rejection logged with its reason.

### AMENDMENT 2.1 (reviewer, 2026-08-15, with the full pass; required
### before run 3)

1. SPOT CHECK UPGRADED from "three URLs readable" to "three rows
   ENGINE-ADDRESSABLE": each spot-check row runs through the actual
   engine (audit channel), and the row counts only if the anchor fetch
   completes inside the size cap with parseable content — i.e. the
   verdict's reasons carry no ANCHOR_* refusal. Majority rule
   unchanged. Rationale on the record: run 2's dataset passed a
   reachability check and then failed 26 times on addressability; a
   check that cannot fail on the failure that actually occurs is the
   soft-check lesson in a lab coat. The spot check now exercises the
   same machinery the sample will.
2. STRATIFIED SAMPLING is standing text, not per-run adaptation: when
   row URLs are non-distinct, stratify deterministically — strata by
   sha256 of the stratum key ascending, rows within a stratum by
   sha256 of canonical row JSON ascending, fixed rows per stratum,
   skipped rows counted.
3. DEPTH-OF-FILE handling is a required design element of M2, with the
   honest expectation that v3's page-shaped pools mostly dissolve both
   issues (page-scrape datasets carry distinct URLs and page-sized
   sources).

### Pre-registered v3 (activated by the full pass for run 3; Kaggle
### first, Apify samples second)

Pool A: Kaggle public datasets, queries "scraped products" then
"ecommerce", newest first, top 30 each — a dataset whose download
requires an account is ineligible (the no-login rule holds even if it
empties this pool honestly). Pool B: public Apify actor sample
datasets: e-commerce-category actors with publicly readable dataset
endpoints, no login, same eligibility. Same stop rule; if v3 also
starves, the finding is the report. The
no-naming wall applies: the published benchmark describes the dataset
class and age, and names no vendor or author unless they have
consented; the private record keeps the identity.

## Row sampling (deterministic)

100 rows by sha256(row_url) ascending — the same selection discipline
as every pack we have shipped. Rows with no parseable claim are
recorded as such (they count against coverage, not against the
dataset). One run, no re-rolls; every verdict ships to the record
including unverifiable.

## Instruments and channel

The production engine via the audit channel (excluded from /stats by
the standing exclusion). One check per row: claim = the dataset's own
extracted value, verified against a live re-fetch of the row's URL.
Verdict mix + coverage computed by script from the signed verdicts,
never by hand.

## The spend number (for Rick, the pilot's second deliverable)

M1 measures actual cost per 100 rows from provider billing deltas
(LLM API + Fly egress) across the run window, giving the first
defensible cost-per-1,000-rows figure. Pre-registered cap: if spend
crosses $25 mid-run, the run pauses and reports rather than finishing
silently. (For scale: the run is 2% of the $500/5,000-row Dataset
Audit SKU; the pilot's cost figure prices the SKU's margin honestly.)

## What M1 is not

Not publishable. No external claim, no post, no letter cites M1
numbers; it exists to harden the method, surface the failure modes
(bot walls, client-rendered values, dead URLs — all three already
observed in the PERMA packs), and produce the coverage KPI definition
that M2 inherits. Publication is a separate future gate with its own
wording pass.

## Deliverables

1. This file, passed by the reviewer before any search or fetch.
2. The frozen search protocol text (added to this file at pass time).
3. AUDIT-M1-RESULTS.md: verdict mix, coverage KPI, spend actuals,
   failure-mode inventory, and the honest sentence about what 100 rows
   can and cannot support.
4. A go/no-go recommendation for M2 scope.
