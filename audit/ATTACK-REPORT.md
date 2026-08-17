# Reversal attack against our own redacted mirrors

Run 2026-08-16 as required by the redaction gates: we attack our
own published artifact and record what happens, win or lose.

## Channel 1: does label order leak evaluation order?
- m2-selection.jsonl: 507 labeled lines, Spearman rho = +0.062 (no usable signal)
- m2v2-selection.jsonl: 507 labeled lines, Spearman rho = +0.087 (no usable signal)

## Channel 2: do any exact per-dataset totals survive?
- none: every 4+ digit value is a date, a spec number, or a cross-dataset aggregate

## Channel 3: replay the first published query and try to align
- live replay returned 20 candidates; the mirror offers only a reason multiset for the whole kaggle pool (163 rejections across 9 reason types)
- alignment result: with line order hash-sorted, label numbers shuffled, and counts bucketed, 163 of 163 rejection rows are interchangeable within their reason class; no unique join key exists between a live candidate and a mirror row
- what replay DOES recover: pool membership. Anyone re-running the published protocol sees roughly the same candidates the registries return. That is independent re-derivation from public registries, not a reversal of our artifact, and the README discloses it as the standing residual

## Verdict
The artifact itself gave up: no label-order signal, no surviving
per-dataset fingerprint, no unique replay join key. The residual is
re-derivation from the public registries themselves, which no
redaction of OUR files can prevent and which the README states.

## Post-pass check: the exact-aggregate constraint system (relay 001, item 5)

The article publishes exact aggregates (17 datasets, 1,694 rows). Could
those totals plus bucketed per-item values form a solvable constraint
system? Recounted from the mirrors: the per-dataset CHECK counts are
directly visible (eleven at 100, six at 99, summing to exactly 1,694)
and carry no identifying information, because sample sizes are OUR
method parameter (100 per dataset by the published scope), not a
property of any source dataset. The bucketed fields are dataset SIZE
totals (claimed and enumerated row counts, byte sizes), and no exact
sum of those appears in the article or any doc, so no constraint binds
the buckets to narrow. Conclusion: the buckets hold at current width;
nothing to solve.
