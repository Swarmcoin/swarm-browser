/**
 * The signature and the decision: a feed signed by a test key is believed;
 * tampered, unsigned, foreign-key, rolled-back and downgrading feeds are not.
 *
 * Every key here is made fresh by the test; the development key on the build
 * PC is never used. WebCrypto is node:crypto's, the same API the browser has.
 */

import assert from "node:assert/strict";
import { verify as nodeVerify, webcrypto } from "node:crypto";
import test from "node:test";

import {
  RUNNING_DEV,
  RUNNING_RELEASE,
  b64,
  bytesOf,
  envelopeFor,
  samplePayload,
  sampleTarget,
  signBytes,
  testKey,
} from "./helpers.mjs";
import { checkFeed, parseEnvelope, verifySignature } from "../../extensions/update/lib/feed.js";

const subtle = webcrypto.subtle;
const KEY = testKey();
const OTHER = testKey();

function check(body, overrides = {}) {
  return checkFeed({
    body,
    publicKeys: [KEY.publicKey],
    subtle,
    running: RUNNING_RELEASE,
    target: "windows-x64",
    lastPublished: null,
    ...overrides,
  });
}

/** Flips one bit of the payload bytes and puts them back, keeping the signature. */
function tamper(body, mutate) {
  const envelope = JSON.parse(body);
  const bytes = new Uint8Array(Buffer.from(envelope.payload, "base64"));
  mutate(bytes);
  envelope.payload = b64(bytes);
  return JSON.stringify(envelope);
}

test("a feed signed by the trusted key, offering a newer build, is an offer", async () => {
  const result = await check(envelopeFor(KEY, samplePayload()));
  assert.equal(result.ok, true);
  assert.equal(result.status, "offer");
  assert.equal(result.published, "2026-09-27T18:00:00Z");
  assert.deepEqual(result.build, sampleTarget());
  assert.equal(result.keyIndex, 0);
});

test("WebCrypto and node:crypto agree on the same signature", async () => {
  const bytes = bytesOf(samplePayload());
  const signature = signBytes(KEY, bytes);
  assert.equal(nodeVerify(null, bytes, KEY.publicKeyObject, signature), true);
  assert.deepEqual(await verifySignature(subtle, [KEY.publicKey], bytes, signature), { ok: true, keyIndex: 0 });
  signature[0] ^= 1;
  assert.equal(nodeVerify(null, bytes, KEY.publicKeyObject, signature), false);
  assert.equal((await verifySignature(subtle, [KEY.publicKey], bytes, signature)).code, "bad_signature");
});

test("a tampered payload is refused: one changed byte anywhere", async () => {
  const body = envelopeFor(KEY, samplePayload());
  const length = parseEnvelope(body).payloadBytes.length;
  for (const index of [0, 1, Math.floor(length / 2), length - 2, length - 1]) {
    const result = await check(tamper(body, (bytes) => { bytes[index] ^= 0x01; }));
    assert.equal(result.ok, false, `byte ${index}`);
    assert.equal(result.code, "bad_signature", `byte ${index}`);
  }
});

test("a tampered payload that still reads as a valid feed is refused", async () => {
  // The dangerous kind: a different download address, still valid JSON.
  const payload = samplePayload();
  const body = envelopeFor(KEY, payload);
  const evil = JSON.parse(body);
  const changed = samplePayload();
  changed.targets["windows-x64"].installer.url =
    "https://github.com/Swarm-Official/swarm-releases/releases/download/evil/SWARM-Browser.exe";
  evil.payload = b64(bytesOf(changed));
  const result = await check(JSON.stringify(evil));
  assert.equal(result.code, "bad_signature");
});

test("the same payload written differently is not the signed payload", async () => {
  const payload = samplePayload();
  const signature = b64(signBytes(KEY, bytesOf(payload)));
  const compact = new TextEncoder().encode(JSON.stringify(payload));
  const body = JSON.stringify({ format: 1, payload: b64(compact), signature });
  assert.equal((await check(body)).code, "bad_signature");
});

test("a tampered signature is refused", async () => {
  const envelope = JSON.parse(envelopeFor(KEY, samplePayload()));
  const signature = new Uint8Array(Buffer.from(envelope.signature, "base64"));
  signature[63] ^= 0x80;
  envelope.signature = b64(signature);
  assert.equal((await check(JSON.stringify(envelope))).code, "bad_signature");
});

test("an unsigned feed is refused, however good its payload", async () => {
  assert.equal((await check(envelopeFor(KEY, samplePayload(), { signature: null }))).code, "unsigned");
  assert.equal((await check(envelopeFor(KEY, samplePayload(), { signature: "" }))).code, "unsigned");
});

test("a feed signed by any other key is refused", async () => {
  const result = await check(envelopeFor(OTHER, samplePayload()));
  assert.equal(result.code, "bad_signature");
});

test("with two trusted keys, either one's signature is believed", async () => {
  const both = { publicKeys: [KEY.publicKey, OTHER.publicKey] };
  assert.equal((await check(envelopeFor(KEY, samplePayload()), both)).keyIndex, 0);
  assert.equal((await check(envelopeFor(OTHER, samplePayload()), both)).keyIndex, 1);
});

test("no usable key, or no Ed25519, means nothing is believed", async () => {
  const body = envelopeFor(KEY, samplePayload());
  assert.equal((await check(body, { publicKeys: [] })).code, "no_key");
  assert.equal((await check(body, { publicKeys: ["not-a-key"] })).code, "no_key");
  assert.equal((await check(body, { publicKeys: [b64(new Uint8Array(31))] })).code, "no_key");
  const noEd25519 = {
    importKey: async () => {
      throw new DOMException("Unrecognized name.", "NotSupportedError");
    },
  };
  assert.equal((await check(body, { subtle: noEd25519 })).code, "no_ed25519");
  assert.equal((await check(body, { subtle: undefined })).code, "no_ed25519");
});

test("the signature is checked before the payload is read", async () => {
  // A payload that is not even JSON, signed by a stranger: the answer is
  // "bad signature", not a parse error, because nothing unsigned is parsed.
  const junk = new TextEncoder().encode("{{{ not json");
  const body = JSON.stringify({ format: 1, payload: b64(junk), signature: b64(signBytes(OTHER, junk)) });
  assert.equal((await check(body)).code, "bad_signature");
  // Signed by the trusted key, the same junk is then a payload error.
  const signed = JSON.stringify({ format: 1, payload: b64(junk), signature: b64(signBytes(KEY, junk)) });
  assert.equal((await check(signed)).code, "bad_payload");
});

test("a correctly signed feed for another product is refused", async () => {
  const payload = { ...samplePayload(), product: "swarm-wallet" };
  assert.equal((await check(envelopeFor(KEY, payload))).code, "wrong_product");
});

/* ── downgrades and rollbacks ───────────────────────────────────────────── */

test("a signed feed offering an OLDER build than the running one is refused", async () => {
  const older = samplePayload({ targets: { "windows-x64": sampleTarget("153.0.8010.40", "9") } });
  const result = await check(envelopeFor(KEY, older));
  assert.equal(result.ok, false);
  assert.equal(result.code, "older");
  const lowerRevision = samplePayload({ targets: { "windows-x64": sampleTarget("153.0.8010.52", "0") } });
  assert.equal((await check(envelopeFor(KEY, lowerRevision))).code, "older");
});

test("the same build as the running one is 'latest', not an offer", async () => {
  const same = samplePayload({ targets: { "windows-x64": sampleTarget("153.0.8010.52", "1") } });
  const result = await check(envelopeFor(KEY, same));
  assert.equal(result.ok, true);
  assert.equal(result.status, "latest");
});

test("a feed published before the last accepted one is refused (no rollback)", async () => {
  const body = envelopeFor(KEY, samplePayload({ published: "2026-09-27T18:00:00Z" }));
  assert.equal((await check(body, { lastPublished: "2026-09-27T18:00:01Z" })).code, "rollback");
  assert.equal((await check(body, { lastPublished: "2026-10-01T00:00:00Z" })).code, "rollback");
  // The same feed again, or a newer one, is fine.
  assert.equal((await check(body, { lastPublished: "2026-09-27T18:00:00Z" })).ok, true);
  assert.equal((await check(body, { lastPublished: "2026-09-26T00:00:00Z" })).ok, true);
});

test("a validly signed old feed replayed after a newer one is refused", async () => {
  const monday = envelopeFor(KEY, samplePayload({ published: "2026-09-28T09:00:00Z" }));
  const tuesday = envelopeFor(
    KEY,
    samplePayload({ published: "2026-09-29T09:00:00Z", targets: { "windows-x64": sampleTarget("153.0.8010.70", "2") } }),
  );
  const first = await check(tuesday);
  assert.equal(first.ok, true);
  const replay = await check(monday, { lastPublished: first.published });
  assert.equal(replay.code, "rollback");
});

test("a feed with no entry for this system is accepted, with nothing offered", async () => {
  const payload = samplePayload({ targets: { "linux-x64": sampleTarget() } });
  const result = await check(envelopeFor(KEY, payload));
  assert.equal(result.ok, true);
  assert.equal(result.status, "no-target");
  assert.equal(result.build, null);
  assert.equal((await check(envelopeFor(KEY, samplePayload()), { target: null })).status, "no-target");
});

test("the development placeholder 0.0.0.0 treats every listed build as newer", async () => {
  const result = await check(envelopeFor(KEY, samplePayload()), { running: RUNNING_DEV });
  assert.equal(result.status, "offer");
});

test("a damaged running version stops the check before anything else", async () => {
  const result = await check(envelopeFor(KEY, samplePayload()), { running: { chromium: "x", swarm: "1", channel: "release" } });
  assert.equal(result.code, "bad_version");
});
