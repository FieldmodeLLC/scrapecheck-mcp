# State of Scraped Data — M2 scope (DRAFT, to the reviewer's gate)

Drafted 2026-08-15 on the M2 GO with three approved design inputs plus
the charter addition (target dataset count chosen and justified here,
not discovered in the writing). M2 is the benchmark-strength
reproduction of M1's measurement; its output is the first publishable
number, through its own future wording gate. M1's numbers stay behind
the wall permanently.

## The metric (locked at M1 close, verbatim)

"Fraction of rows whose claims could not be independently confirmed at
their stated URLs today" — deliberately silent on cause. The benchmark
measures the buyer's risk, not the seller's blame. Reported beside it,
always: the coverage KPI (fraction of rows a server-side vantage could
address at all) and the claim-extractability rate (fraction of rows
carrying a checkable concrete value).

## Target dataset count: N = 25, justified

The headline claim is "across N public scraped datasets." Requirements
that set N:
- No single dataset's pathology may dominate: with equal row
  allocation, each dataset carries 1/N of the sample; N = 25 caps any
  one dataset at 4% of rows.
- The report leads with the MEDIAN dataset's rate plus the
  distribution (quartiles and range), so one M1-style 63% outlier
  shifts the tail, not the headline; medians want N large enough for a
  stable middle — 25 gives twelve datasets on each side of it.
- Feasibility honestly faced: the M1 protocol surfaced roughly one
  eligible dataset per pool sweep. Reaching 25 needs the expanded
  frozen query sets below; if the pools honestly cannot seat 25, the
  run STOPS at the count reached, reports "across N datasets" with the
  actual N, and the shortfall is itself a finding about public scraped
  data's discoverability. N is a target with a floor: below N = 10 the
  benchmark does not publish, because a single dataset would carry
  more than 10% of the claim.

## Rows per dataset: 100 (the pilot-proven unit)

25 × 100 = 2,500 checks ≈ $5.25 in judge fees at the pilot's estimated
rate — inside the approved $25 cap with headroom for spot checks and
partial-dataset replacements. Sampling per dataset: the standing
deterministic rules (sha256 row ordering; stratification text when
URLs are non-distinct; skipped rows counted). Depth-of-file, handled
deliberately per the charter: sha256 ordering is position-independent
by construction — hash order decorrelates from file position — so row
selection cannot favor file heads; where a dataset stores multi-row
sources (the run-2 class), the 2.1 engine-addressability spot check
screens it before a row is spent.

## Dataset selection (frozen before the run, M1 discipline unchanged)

Pools in order, each with FIXED query lists frozen at pass time:
Kaggle (proven fully open), Hugging Face (single-token queries),
GitHub. Expanded query sets are enumerated in an appendix to this doc
BEFORE the run and never edited mid-run; every candidate evaluated in
returned order against the M1 eligibility criteria (amendment 2.1 spot
check included: three rows engine-addressable, majority rule); every
rejection logged with its reason. Eligible datasets accumulate in
selection order until 25 or pool exhaustion. Downloaded datasets
remain untrusted third-party input.

## Diagnostics reported first-class (the M1 rulings carried forward)

- Confidence distribution PER DATASET: the pilot's bimodal split
  (fails at 0.46, passes at 0.97-0.98, nothing between) means the
  judge is not hedging; M2 reports the histogram per dataset, and any
  dataset whose distribution smears into the middle gets flagged for
  characterization rather than silently averaged.
- Per-dataset verdict mix + aggregate + median headline.
- Coverage and claim-extractability per dataset (both discriminate,
  proven in the pilot: 0% vs 100% coverage; a sliver vs all-of-them
  extractable).

## Billing-delta plan (sized to be readable)

~2,500 judge-backed checks lands in readable dollars. Rick reads the
provider billing total before the run starts and after it completes
(two readings, same surface, dates recorded); the delta is the
measured cost, reconciled against the per-check estimate, and the
published cost-per-1,000-rows carries the MEASURED label M1's estimate
could not honestly wear. Fly egress noted as excluded or measured the
same way, stated either way.

## Spend and stop rules

The approved $25 cap carries over (~$0.21 consumed by M1). Same
mid-run pause rule at $25. One run per dataset, no re-rolls;
a dataset that fails mid-run (source dies, rate-limited) reports its
partial rows honestly and is not replaced after its first check spends.

## What M2 is, and is not

It IS the benchmark: the first number built for publication, through
its own wording gate, with the buyer's-risk framing locked. It is NOT
a naming exercise: the no-naming wall holds — dataset identities live
in the private record; the publication describes classes, ages, and
platforms in aggregate unless a named party consents.

## Additions folded at the pass (reviewer, 2026-08-15)

1. PARSE COVERAGE is a recorded number per dataset: rows enumerated by
   our parser vs rows the dataset claims to contain (metadata, card,
   or raw file counts), reported as a ratio. Where the parser cannot
   enumerate everything, the sample describes the enumerated fraction
   and says so. No dataset's unreadable half disappears without a
   trace. (Run 2's readable-subset lesson, formalized.)
2. QUERY APPENDIX PROTOCOL: the frozen queries are written and
   committed before the run, relayed in the run-start announcement,
   and the run begins without waiting on the reviewer's read — query
   shape is instrument, not selection; a badly shaped query yields
   honest none-founds, never corrupted rows. Post-hoc flags apply to
   future runs, never retroactively.

## APPENDIX: frozen queries and instrument guards (committed before
## the run per the protocol; never edited mid-run)

Pool 1 — Kaggle (proven open unauthenticated), sortBy=updated,
pageSize 30, queries in this order:
"scraped products", "ecommerce", "web scraped", "product prices",
"scraped listings", "scraped jobs", "scraped real estate",
"scraped reviews", "scraped news", "scraped books".

Pool 2 — Hugging Face, single tokens, top 50 each, client-sorted by
lastModified descending, in this order:
"scraped", "crawled", "ecommerce", "products", "prices", "listings".

Pool 3 — GitHub repositories, sort=updated, top 30 each, in this
order: "scraped dataset price", "product prices csv",
"scraped listings dataset", "scraped urls dataset".

Shared rules: freshness cutoff = updated on/after 2026-05-17;
candidates evaluated in returned order (Pool 2 after the client-side
sort); dedupe on first appearance; every rejection logged with reason;
2.1 spot check (three rows engine-addressable, majority) before
acceptance; accumulate until 25 accepted or all pools exhausted.

Instrument guards, disclosed as instrument limits (not selection):
dataset downloads over 200MB rejected as too-large-to-evaluate
(logged); individual data files over 50MB skipped from parsing and
counted in the parse-coverage denominator via raw record counts;
per-file enumeration capped at 20,000 parsed rows with the remainder
counted raw into the claimed total. Column detection heuristics: URL
column = majority-http values; claim column priority price > title >
name > availability; provenance = card text exists and names a source
(platform, domain, or an explicit scrape/crawl statement), with the
matched text recorded per dataset — datasets failing any heuristic are
rejected with the heuristic named, so a too-strict instrument shows up
in the log, not in silence.

## AMENDMENTS 2.2 — instrument v2 (all five asks PASSED 2026-08-15
## with one addition; pasted here before the rerun)

1. URL-COLUMN SELECTION prefers page URLs over asset URLs: values
   matching asset extensions (.jpg .jpeg .png .gif .webp .svg .css
   .js .pdf .ico) or asset path segments (/media/, /image, /img/,
   /cache/, /assets/, /static/) do not count toward the majority-http
   test. A dataset whose only URL-ish column is an asset column is
   rejected as "url-column-asset-only".
2. CLAIM SANITIZATION: leading label prefixes stripped (pattern:
   up to 30 letters/spaces followed by a colon or dash); both
   claim_raw and claim_sanitized recorded per row; the sanitized form
   is what the engine checks.
3. VANTAGE SCREEN at harness level, engine untouched, with the
   reviewer's addition applied: the challenge-page signature list
   below is FROZEN AND COMMITTED before the rerun; any signature
   added mid-characterization is logged as an amendment, never
   applied silently. Mechanism: the harness pre-fetches each sampled
   URL once; a body matching any frozen signature classifies the row
   as vantage-challenge (no engine check spent, no decay claim made);
   all other rows proceed to the engine as normal.
4. SANDBOX-SOURCE EXCLUSION codified: datasets whose majority URL
   host is a scraping-practice sandbox are ineligible. Frozen list:
   books.toscrape.com, quotes.toscrape.com, toscrape.com,
   sandbox.oxylabs.io, webscraper.io test sites, scrapethissite.com.
5. PER-PUBLISHER CAP: at most 3 accepted datasets per publisher
   (account/owner prefix); further candidates from that publisher are
   rejected as "publisher-cap".

### FROZEN challenge-page signature list (v1 of the list; committed
### 2026-08-15 before the rerun; amendments logged, never silent)

"Robot or human?" / "Enter the characters you see below" /
"Type the characters you see in this image" /
"api-services-support@amazon.com" / "Robot Check" /
"Just a moment..." / "Checking your browser before accessing" /
"cf-browser-verification" / "needs to review the security of your
connection" / "Access Denied" together with "Reference #" /
"Request unsuccessful. Incapsula incident" / "px-captcha" /
"PerimeterX" / "DataDome" / "unusual traffic from your computer
network" / "Verify you are a human" / "Pardon Our Interruption"

Match rule: case-insensitive substring against the pre-fetch body;
any single match classifies vantage-challenge. The list is an
instrument limit, disclosed; rows it classifies are reported as their
own category, never folded into fail or silently dropped.

## Deliverables

1. This doc, passed, with the frozen query appendix above.
2. AUDIT-M2-RESULTS.md: per-dataset records (verdict mix, coverage,
   claim extractability, PARSE COVERAGE, confidence histogram), the
   distribution, the median headline, measured cost, and the honest-N
   statement.
3. A publication-readiness memo: what the numbers can support, what
   they cannot, and the wording-gate request — the reviewer's gate
   before a word of it goes public.
