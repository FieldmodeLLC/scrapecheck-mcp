#!/usr/bin/env node
/**
 * verify-verdict — offline verification of a ScrapeCheck signed verdict.
 *
 * Zero dependencies (node:crypto only). A verdict is valid iff its ed25519
 * signature verifies over the canonical (recursively key-sorted, no
 * whitespace) JSON serialization of every field except `signature`.
 *
 * Usage:
 *   node tools/verify-verdict.mjs <verdict.json>                    # fetches the public key from the live /pubkey
 *   node tools/verify-verdict.mjs <verdict.json> --pubkey ed25519:… # fully offline
 *   node tools/verify-verdict.mjs <verdict.json> --pubkey key.json  # offline, key from a saved /pubkey response
 *   cat verdict.json | node tools/verify-verdict.mjs -              # stdin
 *
 * Exit code 0 = signature valid; 1 = invalid or error.
 *
 * MIT License — see LICENSE.
 */
import { createPublicKey, verify as edVerify, createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const PUBKEY_URL = "https://scrapecheck.fly.dev/pubkey";

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

// A record can bind content when it carries a hash, whether that hash was
// recorded at issuance or backfilled from an artifact (provenance is printed).
function bindable(rec) {
  return (
    typeof rec.signature_sha256 === "string" &&
    (rec.content_binding === "available" || rec.content_binding === "available_backfilled")
  );
}

function fail(msg) {
  console.error(`INVALID: ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const file = args[0];
if (!file) {
  console.error("usage: verify-verdict.mjs <verdict.json|-> [--pubkey <ed25519:base64 | file>]");
  process.exit(1);
}

const raw = file === "-" ? readFileSync(0, "utf-8") : readFileSync(file, "utf-8");
let verdict;
try {
  verdict = JSON.parse(raw);
} catch {
  fail("input is not valid JSON");
}

// Accept a dataset row as well as a bare verdict. Rows from the Apify Actor
// carry the complete signed envelope under `signed_verdict`, alongside flat
// columns the Actor assembled itself — those extra columns are NOT covered by
// the signature, so verifying the row as-is would fail confusingly. Unwrap it
// and say so, rather than making the reader work out why their first attempt
// looked like a forgery.
if (verdict && typeof verdict.signed_verdict === "object" && verdict.signed_verdict !== null) {
  console.log("(input looks like a dataset row: verifying its signed_verdict envelope, which is the object the signature covers)");
  verdict = verdict.signed_verdict;
}

let pubkey;
const flag = args.indexOf("--pubkey");
// Candidate keys to check. /pubkey publishes an ARCHIVE (active + retired),
// so a verdict signed before a key rotation still verifies without the
// holder knowing a rotation happened. Explicit --pubkey checks only that key.
let candidates = [];
if (flag !== -1 && args[flag + 1]) {
  const v = args[flag + 1];
  if (v.startsWith("ed25519:")) candidates = [{ id: "(supplied)", public_key: v, status: "supplied" }];
  else {
    const body = JSON.parse(readFileSync(v, "utf-8"));
    candidates = Array.isArray(body.keys) && body.keys.length
      ? body.keys
      : [{ id: "(file)", public_key: body.public_key ?? body, status: "supplied" }];
  }
} else {
  const body = await (await fetch(PUBKEY_URL)).json();
  candidates = Array.isArray(body.keys) && body.keys.length
    ? body.keys
    : [{ id: "(scalar)", public_key: body.public_key, status: "active" }];
  console.log(
    `(${candidates.length} key${candidates.length === 1 ? "" : "s"} fetched from ${PUBKEY_URL} — pass --pubkey to verify fully offline)`,
  );
}

const sig = verdict.signature;
if (typeof sig !== "string" || !sig.startsWith("ed25519:")) fail("verdict has no ed25519 signature field");
const { signature: _drop, ...payload } = verdict;
const payloadBytes = Buffer.from(canonicalJson(payload), "utf-8");
const sigBytes = Buffer.from(sig.slice(8), "base64");

let matched = null;
// key_id fast path: try the envelope's claimed key first (order only —
// every published key is still tried, so a false claim changes nothing).
if (typeof verdict.key_id === "string") {
  candidates = [
    ...candidates.filter((c) => c.id === verdict.key_id),
    ...candidates.filter((c) => c.id !== verdict.key_id),
  ];
}
for (const cand of candidates) {
  const pk = cand.public_key;
  if (typeof pk !== "string" || !pk.startsWith("ed25519:")) continue;
  let key;
  try {
    key = createPublicKey({ key: Buffer.from(pk.slice(8), "base64"), format: "der", type: "spki" });
  } catch {
    continue; // malformed entry: skip, don't abort the whole check
  }
  if (edVerify(null, payloadBytes, key, sigBytes)) { matched = cand; break; }
}

if (!matched) {
  fail(
    candidates.length > 1
      ? `signature does not verify against any of the ${candidates.length} published keys — the verdict was altered, or was not signed by this service`
      : "signature does not verify — the verdict was altered or was not signed by this key",
  );
}

const which = matched.status === "retired"
  ? `${matched.id}, retired ${matched.retired_at ?? "(date unstated)"}${matched.reason ? `: ${matched.reason}` : ""}`
  : `${matched.id}${matched.status === "active" ? ", active" : ""}`;
console.log(`VALID: signature verifies (signed by ${which})`);
console.log(`  verdict:    ${verdict.verdict} (confidence ${verdict.confidence})`);
console.log(`  verdict_id: ${verdict.verdict_id}`);
console.log(`  check_type: ${verdict.check_type}`);
console.log(`  engine:     ${verdict.engine ?? "(none)"}`);
// Envelope v2 fields (additive, 2026-08): displayed when present; old
// verdicts produce byte-identical output to before.
// Only cross-check when the matching key has a real published id. With
// --pubkey the caller supplied a bare key, so there is no id to compare
// against and a "mismatch" would be a false alarm about their own key.
// Silence would be safe; saying why the check didn't run is better.
if (verdict.key_id !== undefined && matched.status === "supplied") {
  console.log(`  key_id:     ${verdict.key_id} (envelope's claim; you supplied a key directly, so no cross-check was performed)`);
}
if (verdict.key_id !== undefined && matched.status !== "supplied") {
  if (verdict.key_id === matched.id) {
    console.log(`  key_id:     ${verdict.key_id} (envelope claim matches the verifying key)`);
  } else {
    console.log(`  WARNING:    envelope claims key_id ${verdict.key_id} but the signature verifies under ${matched.id} — inconsistent envelope; bug or forgery, treat with care.`);
  }
}
if (verdict.verifier_url !== undefined) {
  if (verdict.verifier_url === new URL(PUBKEY_URL).origin) {
    console.log(`  issuer:     ${verdict.verifier_url} (embedded pointer; keys were checked against the pinned origin, never the embedded URL)`);
  } else {
    console.log(`  WARNING:    embedded verifier_url differs from this verifier's pinned origin — the document does not choose its judge; shown for information only. (embedded: ${verdict.verifier_url})`);
  }
}
if (verdict.source_hash !== undefined) {
  if (verdict.source_hash === null) {
    console.log(`  source_hash: null (no page content was fetched for this verdict — SAFE_MODE or anchor failure; the envelope states this rather than omitting the field)`);
  } else {
    console.log(`  source_hash: ${verdict.source_hash} — fingerprint of the normalized page text this verdict judged. Comparable between verdicts with the same engine digest; not independently recomputable today.`);
  }
}
if (matched.status === "retired") {
  // A signature alone cannot establish authenticity for a key whose private
  // half was exposed: anyone holding it can mint verdicts that verify here,
  // INCLUDING forgeries that reuse a real verdict_id. So for retired keys we
  // bind content against the issuer's record when we can reach it.
  const offline = flag !== -1;
  if (offline) {
    console.log(`  WARNING:    this key is RETIRED${matched.reason ? ` (${matched.reason})` : ""}.`);
    console.log(`              A valid signature from a retired key proves the verdict was signed`);
    console.log(`              by that key — not that ScrapeCheck issued it. Re-run without`);
    console.log(`              --pubkey to confirm this verdict against the issuer's record.`);
  } else {
    const issuanceUrl = PUBKEY_URL.replace(/\/pubkey$/, `/verdicts/${encodeURIComponent(verdict.verdict_id ?? "")}`);
    let rec = null;
    try {
      const r = await fetch(issuanceUrl);
      rec = await r.json();
    } catch {
      rec = null;
    }
    const localHash = createHash("sha256").update(sig).digest("hex");
    if (!rec) {
      console.log(`  WARNING:    key is RETIRED${matched.reason ? ` (${matched.reason})` : ""} and the issuer's record was unreachable.`);
      console.log(`              A retired-key signature alone does not prove ScrapeCheck issued this.`);
    } else if (rec.issued === false) {
      console.error(`  NOT ISSUED: ScrapeCheck has no record of issuing verdict_id ${verdict.verdict_id}.`);
      console.error(`              Signed by a retired (${matched.reason ?? "retired"}) key. TREAT AS FORGED.`);
      process.exit(1);
    } else if (bindable(rec) && rec.signature_sha256 !== localHash) {
      console.error(`  CONTENT MISMATCH: that verdict_id was issued, but with DIFFERENT content.`);
      console.error(`              This is forged content under a real id. TREAT AS FORGED.`);
      process.exit(1);
    } else if (bindable(rec)) {
      console.log(`  CONFIRMED:  issued by ScrapeCheck, content matches the issuer's record.`);
      console.log(`              (Signed before the key rotation; the retired key is expected here.)`);
      // A binding is only as strong as the artifact behind it — say which.
      if (rec.content_binding === "available_backfilled") {
        console.log(
          rec.binding_provenance === "published_artifact"
            ? `              Binding recorded after the fact, from a verdict published BEFORE the`
            : `              Binding recorded after the fact, from a copy retained only by the issuer`,
        );
        console.log(
          rec.binding_provenance === "published_artifact"
            ? `              key exposure — its signature is fixed in public git history.`
            : `              — weaker than a pre-exposure public artifact. Weigh accordingly.`,
        );
      }
    } else {
      console.log(`  PARTIAL:    ScrapeCheck confirms issuing this verdict_id, but this verdict`);
      console.log(`              predates signature logging, so its content cannot be bound.`);
      console.log(`              Existence is confirmed; content is not.`);
    }
  }
}
process.exit(0);
