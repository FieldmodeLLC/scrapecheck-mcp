# Audit M2 — benchmark run results

## Billing-delta record (addition to the measured-cost method)

BEFORE reading — screenshot taken by Rick, received 2026-08-15:
credit balance $18.17 remaining; month-to-date spend $0.92 (limit
period resets Sep 1, 2026; monthly limit $200,000; last credit grant
$21.68 on Mar 7, 2026). Honest note: the screenshot itself carries no
visible date — the reception timestamp in this record (2026-08-15,
logged at receipt) serves as the date anchor for the pair. The AFTER
reading uses the same two numbers from the same page.

Run status: selection + checks launched 2026-08-15; completed same day.

## Mechanical results (all signed; row logs in m2-checks.jsonl,
## selection log in m2-selection.jsonl, both committed)

Selection: 465 candidates evaluated across the three frozen pools;
**17 datasets accepted** (Kaggle 16, GitHub 1; HF contributed zero
acceptances — 41 of its candidates failed at the rows-API layer),
every rejection logged by named heuristic (198 stale, 100
provenance-undocumented, 30 no-URL-column, 23 no-data-files, 12
no-parseable-rows, 6 too-large, 5 spot-check-not-addressable, 2
no-claim-column, rest API failures). Honest-N statement: **17 < 25,
above the floor of 10.** Parse coverage: 1.0 for every accepted
dataset (each parsed fully within the enumeration caps).

Checks: 1,713 spent (66 selection spot checks including 15 on rejected
candidates + 1,647 sample checks), 1,694 rows logged with verdicts.
Aggregate verdict mix: **215 pass / 851 fail / 628 unverifiable.**
Estimated spend ~$3.60 at the per-check rate; Rick's AFTER billing
reading requested at run close to convert estimate to measured.

Per-dataset not-confirmed rates run 0.05 to 1.0, median 0.98 — AND
THAT MEDIAN IS NOT A DECAY MEASUREMENT. See below.

## The smear flag fired, and characterization found instrument defects
## (the pre-registered rule doing its job)

M1's bimodal confidence (0.46 fails / 0.97 passes) did NOT reproduce:
most datasets' fails sit at 0.9 confidence, i.e. the distribution
smeared, which under the scope doc's rule forces characterization
before any averaging. Characterization (log reads, no new checks)
found three INSTRUMENT-DEFECT classes dominating the fails:

1. WRONG URL COLUMN: the majority-http heuristic picks the FIRST
   URL-ish column with no page-vs-asset preference. The
   books.toscrape dataset's picked column is its IMAGE path
   (media/cache/...) — 100 checks asked whether a price is present at
   an image URL. Verdict fail is technically correct and analytically
   meaningless.
2. NON-PRODUCT PAGE URLS + CLAIM PREFIX NOISE: the HOST-002 dataset's
   URL column holds store-front pages (HOST-002/stores/...) and its
   claim strings carry prefixes ("Typical price: $17.99").
3. VANTAGE-AS-FAIL: bot-walled sources (HOST-006, parts of HOST-002)
   that serve challenge or partial content at HTTP 200 produce fails
   at 0.9 rather than unverifiable — a vantage artifact wearing a
   decay costume.

CONTRAST that proves the instrument works when pointed right: the one
dataset with a clean product-URL column read 95% pass / 5% fail.

Also flagged pre-run and standing: one accepted dataset scrapes the
books.toscrape.com training sandbox (the automated provenance
heuristic passed it on a ".com" match; M1's hand evaluation had
rejected that class), and one publisher's HOST-001 series accounts for a majority of the 17 acceptances (per-publisher concentration joins per-dataset weight
in the next design).

## Consequence, stated plainly

**No number from this run is a benchmark. The M2 medians join M1's
numbers behind the not-publishable wall.** What the run actually
delivered: the selection pipeline at scale (465 candidates, zero
selection judgment), the honest-N machinery, parse coverage as a
recorded number, and a characterized defect inventory that defines
instrument v2. The benchmark needs a third iteration of the
row-instrument, not more rows through this one.

## Instrument v2 asks (to the reviewer, each a named fix)

1. URL-column selection prefers page URLs over asset URLs (extension
   and path-pattern screen), and rejects datasets whose only URL
   column is an asset column.
2. Claim sanitization: strip label prefixes; currency-aware
   normalization (the ₹/£ classes); claim recorded both raw and
   sanitized.
3. Vantage screen: a challenge-page detector so bot-walled 200s
   classify as unverifiable (vantage), never fail (decay) — this may
   belong in the run harness, not the engine, to keep the engine
   unchanged.
4. Sandbox-source exclusion joins the frozen eligibility text
   (books.toscrape and kin, the M1 precedent codified).
5. Per-publisher cap (e.g. max 3 datasets per publisher) joins the
   selection rules.
These are drafted as scope-doc amendments when the reviewer takes
them up; nothing reruns until then. The $25 cap has ~$21 of headroom
for the v2 run.

## Run 2 v2 (2026-08-15, amendments 2.2, frozen signature list
## committed pre-run): COMPLETE — the fixes worked, the pool is the
## constraint

**Every structural fix fired, with evidence:** url-column-asset-only
caught 1 (the run-1 books dataset's image column), sandbox-source
caught 3 — including run 1's "cleanest" dataset (its 95% pass was a
static sandbox artifact; the codified rule caught what looked like the
best data in the study), publisher-cap rejected 25 (the HOST-001 series
capped at 3), claim sanitization active on every row (raw + sanitized
both logged).

**Vantage screen: the frozen signature list v1 matched ZERO pages** —
an honest zero, reported per the amendment rule rather than tuned
away. The bot-wall texture persists but classifies engine-side:
HOST-006 rows read 97% unverifiable (anchor refusals — the engine
already says "couldn't read it"), and the HOST-002 store pages serve
READABLE content on which the claimed prices are genuinely absent —
which is a legitimate reading under the locked cause-silent metric,
not a misclassification. A post-hoc characterization fetch of one
HOST-002 URL got HTTP 429 (rate limit; logged). The signature list
stays v1; no additions proposed until characterization justifies
them, logged as amendments per the rule.

**Results: 5 datasets, 499 rows, 29 pass / 205 fail / 265
unverifiable / 0 vantage-challenge. N = 5 < the floor of 10: THE RUN
DOES NOT PUBLISH**, by its own pre-registered machinery. Median
not-confirmed rate among engine-addressed rows 0.99, recorded and
walled with the rest.

**The binding constraint, named: freshness.** 221 of the rejections
are stale-dataset rejections; the 90-day window over these pools
yields single-digit eligible datasets per sweep. The instrument is
now clean enough that the pool, not the pipeline, is what stands
between the study and N >= 10.

**MEASURED COST — the billing pair closed 2026-08-15.** Before:
$18.17 balance / $0.92 month-to-date. After: $15.73 / $3.36. Both
surfaces agree: **$2.44 measured across 2,223 M2 checks (runs 1 +
2v2) = $1.10 per 1,000 checks, MEASURED.** (M1's ~$0.21 predates the
pair and keeps its estimate label.) Rick additionally set the
provider's monthly spend limit to $25, so the approved cap is now
enforced at the billing layer itself.

## Three shaped options for the reviewer (reaching N >= 10)

(a) Widen the freshness window to 180 days — an ELIGIBILITY change,
so it is the reviewer's gate, with the honest note that "fresh
scrape" still defends at 180 days and the age of every dataset is
recorded anyway; (b) add pools with their own frozen queries
(data.world, Zenodo, HF full-text via hub search); (c) revise the
floor or claim shape (not recommended; the floor is what makes the
number citable). Recommendation on record: (a) + (b) together, one
more run, ~$19 of measured headroom.
