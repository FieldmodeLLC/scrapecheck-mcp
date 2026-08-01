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
import { createPublicKey, verify as edVerify } from "node:crypto";
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

let pubkey;
const flag = args.indexOf("--pubkey");
if (flag !== -1 && args[flag + 1]) {
  const v = args[flag + 1];
  if (v.startsWith("ed25519:")) pubkey = v;
  else {
    const body = JSON.parse(readFileSync(v, "utf-8"));
    pubkey = body.public_key ?? body;
  }
} else {
  const res = await fetch(PUBKEY_URL);
  pubkey = (await res.json()).public_key;
  console.log(`(public key fetched from ${PUBKEY_URL} — pass --pubkey to verify fully offline)`);
}

if (!pubkey?.startsWith("ed25519:")) fail("public key must be 'ed25519:<base64 SPKI DER>'");
const sig = verdict.signature;
if (typeof sig !== "string" || !sig.startsWith("ed25519:")) fail("verdict has no ed25519 signature field");

const { signature: _drop, ...payload } = verdict;
let key;
try {
  key = createPublicKey({ key: Buffer.from(pubkey.slice(8), "base64"), format: "der", type: "spki" });
} catch {
  fail("public key is not valid base64 SPKI DER");
}
const ok = edVerify(null, Buffer.from(canonicalJson(payload), "utf-8"), key, Buffer.from(sig.slice(8), "base64"));

if (!ok) fail("signature does not verify — the verdict was altered or was not signed by this key");

console.log("VALID: signature verifies against the public key");
console.log(`  verdict:    ${verdict.verdict} (confidence ${verdict.confidence})`);
console.log(`  verdict_id: ${verdict.verdict_id}`);
console.log(`  check_type: ${verdict.check_type}`);
console.log(`  engine:     ${verdict.engine ?? "(none)"}`);
process.exit(0);
