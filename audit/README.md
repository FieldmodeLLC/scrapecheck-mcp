# Benchmark audit trail — redacted public mirrors

These are the pre-registration, amendments, results, decision log, and
run logs behind the article "We ran our benchmark five times and we
have no number to publish," with identities replaced by opaque labels
(DS-nnn datasets, PUB-nnn publishers, HOST-nnn hosts, SRC-nnn
sources). We will not name someone's dataset in a study about failure
without their consent. Labels are not hashes, because a hash of a name
is reversible by hashing candidate names — and label NUMBERS are
assigned by a secret shuffle, because sequential numbering would echo
our published search protocol's result order, which is replayable.

Withheld for the same reversibility reason: row-level URLs, claim
strings and reason strings (they quote page content), provenance text,
and VERDICT IDS — our own public verdict lookup resolves an id to its
URL and claim, so leaving ids here would undo the redaction. Standing
rule: nothing in a redacted mirror may be resolvable through any
surface we ourselves operate. Per-dataset row totals and byte sizes
are BUCKETED (exact totals are searchable fingerprints), and log lines
are re-sorted by content hash rather than evaluation order (the
evaluation order is replayable against the published queries). Verdict
mixes, confidences, states, every rule, and every amendment are intact
and unredacted, including the frozen challenge-page signature list
inside the scope document, which is technical fact and byte-verbatim.

DISCLOSED RESIDUAL: our selection method is public and deterministic
by design, so anyone can re-execute it against the same registries and
recover a similar candidate pool independently. Redaction prevents our
artifacts from confirming any specific identity, and the commitment
prevents us from ever swapping the mapping; it cannot prevent
independent re-derivation from public registries, and honesty requires
saying so. See ATTACK-REPORT.md for our own reversal attempt.

Commitment: sha256 of the private identity-mapping file (which
contains the shuffled assignment, so the commitment covers the
shuffle) = `60f0f321e23ec9944196e38140307e5cb3dc5cbac01b1d2c6e0c7fc2f04294e7`. If a dataset author consents to being
named, the mapping is revealed and provably matches this commitment.
