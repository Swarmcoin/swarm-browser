/**
 * Parsing: strict base64, the envelope, the payload, links and timestamps.
 * No signatures here (verify.test.mjs) and no network anywhere.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { HEX_A, b64, bytesOf, samplePayload, sampleTarget } from "./helpers.mjs";
import {
  ALLOWED_LINK_PREFIXES,
  FEED_URL,
  MAX_FEED_BYTES,
  MAX_PAYLOAD_BYTES,
  decodeBase64,
  encodeBase64,
  parseEnvelope,
  parseLink,
  parsePayload,
  parsePublished,
} from "../../extensions/update/lib/feed.js";

const SIG = b64(new Uint8Array(64).fill(7));

function envelope(fields) {
  return JSON.stringify({ format: 1, payload: b64(bytesOf(samplePayload())), signature: SIG, ...fields });
}

/* ── base64 ─────────────────────────────────────────────────────────────── */

test("base64 round-trips every length and every byte value", () => {
  for (let length = 0; length < 70; length += 1) {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) bytes[i] = (i * 37 + length) & 255;
    const text = encodeBase64(bytes);
    assert.equal(text, Buffer.from(bytes).toString("base64"));
    assert.deepEqual(decodeBase64(text), bytes);
  }
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.deepEqual(decodeBase64(encodeBase64(all)), all);
});

test("base64 accepts only the one canonical, padded spelling", () => {
  for (const bad of [
    "QQ", // missing padding
    "QQ=", // wrong padding
    "Q===", // too much padding
    "QR==", // non-canonical: trailing bits set
    "QUI=\n", // whitespace
    " QUI=",
    "QU I=",
    "QUI-", // URL alphabet
    "QUI_",
    "Q=I=", // padding in the middle
    "====",
    "QUJD\u00e9===",
  ]) {
    assert.equal(decodeBase64(bad), null, JSON.stringify(bad));
  }
  assert.equal(decodeBase64(42), null);
  assert.equal(decodeBase64(null), null);
  assert.deepEqual(decodeBase64(""), new Uint8Array(0));
  assert.deepEqual(decodeBase64("QQ=="), new Uint8Array([65]));
});

/* ── the envelope ───────────────────────────────────────────────────────── */

test("a well-formed envelope comes apart into payload bytes and a 64-byte signature", () => {
  const parsed = parseEnvelope(envelope({}));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.payloadBytes, bytesOf(samplePayload()));
  assert.equal(parsed.signature.length, 64);
  // Bytes, ArrayBuffers and strings are all accepted as the body.
  assert.equal(parseEnvelope(new TextEncoder().encode(envelope({}))).ok, true);
  assert.equal(parseEnvelope(new TextEncoder().encode(envelope({})).buffer).ok, true);
});

test("an envelope without a signature is refused as unsigned", () => {
  for (const signature of [undefined, null, ""]) {
    const body = JSON.stringify({ format: 1, payload: b64(bytesOf(samplePayload())), signature });
    assert.equal(parseEnvelope(body).code, "unsigned", String(signature));
  }
  const noField = JSON.stringify({ format: 1, payload: b64(bytesOf(samplePayload())) });
  assert.equal(parseEnvelope(noField).code, "unsigned");
});

test("the format must be exactly the number 1", () => {
  for (const format of [undefined, 0, 2, "1", 1.5, null]) {
    assert.equal(parseEnvelope(envelope({ format })).code, "bad_format", String(format));
  }
});

test("malformed envelopes are refused before anything is trusted", () => {
  assert.equal(parseEnvelope("not json").code, "bad_envelope");
  assert.equal(parseEnvelope("[]").code, "bad_envelope");
  assert.equal(parseEnvelope("null").code, "bad_envelope");
  assert.equal(parseEnvelope(new Uint8Array([0xff, 0xfe, 0x00])).code, "bad_envelope");
  assert.equal(parseEnvelope(42).code, "bad_envelope");
  assert.equal(parseEnvelope(envelope({ payload: "" })).code, "bad_envelope");
  assert.equal(parseEnvelope(envelope({ payload: 12 })).code, "bad_envelope");
  assert.equal(parseEnvelope(envelope({ payload: "not base64!" })).code, "bad_envelope");
  assert.equal(parseEnvelope(envelope({ signature: "c2hvcnQ=" })).code, "bad_signature");
  assert.equal(parseEnvelope(envelope({ signature: 5 })).code, "bad_signature");
  assert.equal(parseEnvelope(envelope({ signature: `${SIG}\n` })).code, "bad_signature");
});

test("size caps: the whole feed and the payload inside it", () => {
  const big = "x".repeat(MAX_FEED_BYTES + 1);
  assert.equal(parseEnvelope(big).code, "too_large");
  const hugePayload = new Uint8Array(MAX_PAYLOAD_BYTES + 3).fill(32);
  // 32 KiB of payload is 43,692 characters of base64: under the feed cap, over the payload cap.
  assert.equal(parseEnvelope(JSON.stringify({ format: 1, payload: b64(hugePayload), signature: SIG })).code, "too_large");
});

/* ── the payload ────────────────────────────────────────────────────────── */

test("a sample payload parses into its targets", () => {
  const parsed = parsePayload(bytesOf(samplePayload()));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.payload.published, "2026-09-27T18:00:00Z");
  assert.equal(parsed.payload.publishedMs, Date.UTC(2026, 8, 27, 18, 0, 0));
  assert.deepEqual(parsed.payload.targets["windows-x64"], sampleTarget());
});

test("unknown fields are ignored, so a later format can add some", () => {
  const payload = samplePayload();
  payload.extra = { anything: true };
  payload.targets["windows-x64"].signedBy = "someone";
  const parsed = parsePayload(bytesOf(payload));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.payload.targets["windows-x64"], sampleTarget());
});

test("the payload must be for this product", () => {
  for (const product of [undefined, "swarm-wallet", "SWARM-BROWSER", ""]) {
    const payload = { ...samplePayload(), product };
    assert.equal(parsePayload(bytesOf(payload)).code, "wrong_product", String(product));
  }
});

test("every field of a target is checked", () => {
  const cases = {
    "chromium not four numbers": (t) => { t.chromium = "153.0.8010"; },
    "chromium with a leading zero": (t) => { t.chromium = "153.0.08010.52"; },
    "chromium as a number": (t) => { t.chromium = 153; },
    "swarm as a number": (t) => { t.swarm = 2; },
    "swarm negative": (t) => { t.swarm = "-1"; },
    "swarm with letters": (t) => { t.swarm = "2a"; },
    "installer missing": (t) => { delete t.installer; },
    "portable missing": (t) => { delete t.portable; },
    "notes missing": (t) => { delete t.notes; },
    "sha256 upper case": (t) => { t.installer.sha256 = HEX_A.toUpperCase(); },
    "sha256 short": (t) => { t.installer.sha256 = HEX_A.slice(1); },
    "size zero": (t) => { t.installer.size = 0; },
    "size negative": (t) => { t.portable.size = -5; },
    "size fractional": (t) => { t.portable.size = 1.5; },
    "size as a string": (t) => { t.portable.size = "123"; },
    "size over 4 GiB": (t) => { t.portable.size = 4 * 1024 ** 3 + 1; },
    "installer over http": (t) => { t.installer.url = t.installer.url.replace("https:", "http:"); },
    "installer on another host": (t) => { t.installer.url = "https://example.com/SWARM-Browser.exe"; },
    "notes on another host": (t) => { t.notes = "https://example.com/notes"; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const payload = samplePayload();
    mutate(payload.targets["windows-x64"]);
    const parsed = parsePayload(bytesOf(payload));
    assert.equal(parsed.ok, false, name);
    assert.equal(parsed.code, "bad_payload", name);
    assert.match(parsed.detail, /windows-x64/, name);
  }
});

test("targets must be a non-empty object with plain names", () => {
  for (const targets of [undefined, null, [], {}, "windows-x64"]) {
    const parsed = parsePayload(bytesOf({ ...samplePayload(), targets }));
    assert.equal(parsed.code, "bad_payload", JSON.stringify(targets));
  }
  for (const name of ["Windows-x64", "windows_x64", "__proto__", "windows-x64-extra", ""]) {
    const text = `{"product":"swarm-browser","published":"2026-09-27T18:00:00Z","targets":{${JSON.stringify(name)}:${JSON.stringify(sampleTarget())}}}`;
    assert.equal(parsePayload(bytesOf(text)).code, "bad_payload", name);
  }
});

test("payload bytes that are not UTF-8 JSON objects are refused", () => {
  assert.equal(parsePayload(new Uint8Array([0xc3, 0x28])).code, "bad_payload");
  assert.equal(parsePayload(bytesOf("[1,2]")).code, "bad_payload");
  assert.equal(parsePayload(bytesOf("{")).code, "bad_payload");
});

/* ── links and timestamps ───────────────────────────────────────────────── */

test("links: https, an allowed prefix, and written exactly as the parser would", () => {
  assert.deepEqual(ALLOWED_LINK_PREFIXES, ["https://github.com/Swarm-Official/", "https://swarm.green/"]);
  for (const good of [
    "https://github.com/Swarm-Official/swarm-releases/releases/download/v1/SWARM-Browser.exe",
    "https://swarm.green/browser/notes/153.0.8010.60-2",
  ]) {
    assert.equal(parseLink(good), good);
  }
  for (const bad of [
    "http://swarm.green/x",
    "https://swarm.green.evil.example/x",
    "https://swarm.green@evil.example/x",
    "https://user:pass@swarm.green/x",
    "https://SWARM.green/x",
    "https://github.com/Swarm-Official/../evil/x",
    "https://github.com/Swarm-Official/%2e%2e/evil/x",
    "https://github.com/swarm-official/x",
    "https://github.com/Swarm-Officialx/x",
    "https://swarm.green",
    "javascript:alert(1)",
    "file:///C:/Windows/System32/calc.exe",
    " https://swarm.green/x",
    "",
    null,
    `https://swarm.green/${"a".repeat(2100)}`,
  ]) {
    assert.equal(parseLink(bad), null, String(bad));
  }
});

test("published: strict UTC timestamps only, and real calendar dates", () => {
  assert.equal(parsePublished("2026-09-27T18:00:00Z"), Date.UTC(2026, 8, 27, 18));
  assert.equal(parsePublished("2026-09-27T18:00:00.250Z"), Date.UTC(2026, 8, 27, 18, 0, 0, 250));
  for (const bad of [
    "2026-09-27",
    "2026-09-27T18:00:00",
    "2026-09-27T18:00:00+00:00",
    "2026-09-27 18:00:00Z",
    "2026-02-30T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-09-27T24:00:00Z",
    "27/09/2026",
    1790000000000,
    null,
  ]) {
    assert.equal(parsePublished(bad), null, String(bad));
  }
});

test("the release feed address is fixed and carries no query", () => {
  assert.equal(FEED_URL, "https://swarm.green/browser/updates.json");
  const url = new URL(FEED_URL);
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
});
