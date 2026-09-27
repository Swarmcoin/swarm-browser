/**
 * The request and the whole check, against a fake fetch.
 *
 * helpers.mjs has replaced the real fetch with one that throws, so every
 * request below goes to recordingFetch and nothing leaves this machine.
 */

import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

import {
  FEED,
  RUNNING_DEV,
  RUNNING_RELEASE,
  envelopeFor,
  fakeResponse,
  recordingFetch,
  samplePayload,
  sampleTarget,
  testKey,
} from "./helpers.mjs";
import { REQUEST_INIT, chooseFeedUrl, fetchFeed, runCheck } from "../../extensions/update/lib/check.js";
import { MAX_FEED_BYTES } from "../../extensions/update/lib/feed.js";
import { buildView } from "../../extensions/update/lib/state.js";

const KEY = testKey();
const NOW = Date.UTC(2026, 8, 28, 9, 0, 0);

test("the real fetch is switched off in this process", () => {
  assert.throws(() => fetch("https://swarm.green/browser/updates.json"), /must not use the network/);
});

/* ── the request ────────────────────────────────────────────────────────── */

test("the request carries no cookies, no cache, no referrer and nothing personal", async () => {
  const fetchImpl = recordingFetch(() => fakeResponse(envelopeFor(KEY, samplePayload())));
  const result = await fetchFeed(fetchImpl, FEED);
  assert.equal(result.ok, true);
  assert.equal(fetchImpl.calls.length, 1);
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, "https://swarm.green/browser/updates.json");
  assert.equal(new URL(url).search, "");
  assert.equal(init.method, "GET");
  assert.equal(init.credentials, "omit");
  assert.equal(init.cache, "no-store");
  assert.equal(init.referrerPolicy, "no-referrer");
  assert.equal(init.mode, "cors");
  assert.deepEqual(init.headers, { Accept: "application/json", "Accept-Language": "*" });
  assert.equal(init.body, undefined);
  assert.ok(init.signal instanceof AbortSignal);
  // Exactly these request fields and no others.
  assert.deepEqual(Object.keys(init).sort(), [...Object.keys(REQUEST_INIT), "signal"].sort());
});

test("404 means nothing has been published yet; other errors are errors", async () => {
  const missing = await fetchFeed(recordingFetch(() => fakeResponse("<html>404</html>", { status: 404 })), FEED);
  assert.equal(missing.code, "not_published");
  const broken = await fetchFeed(recordingFetch(() => fakeResponse("oops", { status: 503 })), FEED);
  assert.equal(broken.code, "http");
  assert.equal(broken.httpStatus, 503);
});

test("an answer from anywhere but https://swarm.green is ignored", async () => {
  for (const url of ["https://evil.example/browser/updates.json", "http://swarm.green/browser/updates.json", "https://www.swarm.green/x"]) {
    const result = await fetchFeed(recordingFetch(() => fakeResponse("{}", { url })), FEED);
    assert.equal(result.code, "wrong_origin", url);
  }
});

test("network failures and timeouts are reported, not thrown", async () => {
  const down = await fetchFeed(async () => {
    throw new TypeError("Failed to fetch");
  }, FEED);
  assert.equal(down.code, "network");
  const hanging = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  const slow = await fetchFeed(hanging, FEED, { timeoutMs: 25 });
  assert.equal(slow.code, "timeout");
});

test("an oversized answer is refused by its declared length, and while it streams", async () => {
  const declared = await fetchFeed(
    recordingFetch(() => fakeResponse("{}", { headers: { "content-length": String(MAX_FEED_BYTES + 1) } })),
    FEED,
  );
  assert.equal(declared.code, "too_large");
  let pulls = 0;
  const endless = new ReadableStream({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(1024));
    },
  });
  const streamed = await fetchFeed(recordingFetch(() => fakeResponse(endless)), FEED, { maxBytes: 4096 });
  assert.equal(streamed.code, "too_large");
  assert.ok(pulls < 50, `stopped reading after ${pulls} chunks`);
});

/* ── which address ──────────────────────────────────────────────────────── */

test("a release build always asks the one fixed address", () => {
  for (const custom of [null, "", "https://swarm.green/browser/smoke/updates.json", "https://evil.example/x"]) {
    assert.deepEqual(chooseFeedUrl("release", custom), { ok: true, url: FEED, custom: false }, String(custom));
  }
});

test("a development copy may be pointed at another plain swarm.green address only", () => {
  assert.deepEqual(chooseFeedUrl("dev", null), { ok: true, url: FEED, custom: false });
  assert.deepEqual(chooseFeedUrl("dev", "https://swarm.green/browser/smoke/updates.json"), {
    ok: true,
    url: "https://swarm.green/browser/smoke/updates.json",
    custom: true,
  });
  for (const bad of [
    "http://swarm.green/browser/updates.json",
    "https://evil.example/browser/updates.json",
    "https://swarm.green.evil.example/x",
    "https://swarm.green/browser/updates.json?id=123",
    "https://swarm.green/browser/updates.json#x",
    "https://user@swarm.green/x",
    "https://swarm.green:8443/x",
    "not a url",
    42,
  ]) {
    assert.equal(chooseFeedUrl("dev", bad).code, "bad_custom_url", String(bad));
  }
});

/* ── the whole check ────────────────────────────────────────────────────── */

async function run(fetchImpl, { running = RUNNING_RELEASE, stored = {}, nowMs = NOW, target = "windows-x64" } = {}) {
  return runCheck({ fetchImpl, subtle: webcrypto.subtle, nowMs, running, target, stored, publicKeys: [KEY.publicKey] });
}

test("a good feed is stored as accepted, and the view turns it into an offer", async () => {
  const fetchImpl = recordingFetch(() => fakeResponse(envelopeFor(KEY, samplePayload())));
  const next = await run(fetchImpl);
  assert.equal(next.lastCheck.ok, true);
  assert.equal(next.lastCheck.status, "offer");
  assert.equal(next.lastCheck.at, new Date(NOW).toISOString());
  assert.deepEqual(next.accepted, {
    at: new Date(NOW).toISOString(),
    published: "2026-09-27T18:00:00Z",
    target: "windows-x64",
    build: sampleTarget(),
  });
  const view = buildView({ running: RUNNING_RELEASE, target: "windows-x64", stored: next, nowMs: NOW });
  assert.equal(view.headline, "offer");
  assert.equal(view.offer.key, "153.0.8010.60+2");
  assert.equal(view.offer.installer.sha256, sampleTarget().installer.sha256);
});

test("a refused feed changes nothing but the last-check note", async () => {
  const good = await run(recordingFetch(() => fakeResponse(envelopeFor(KEY, samplePayload()))));
  const other = testKey();
  const next = await run(recordingFetch(() => fakeResponse(envelopeFor(other, samplePayload()))), {
    stored: good,
    nowMs: NOW + 1000,
  });
  assert.equal(next.lastCheck.ok, false);
  assert.equal(next.lastCheck.code, "bad_signature");
  assert.deepEqual(next.accepted, good.accepted);
  // Yesterday's valid offer still stands on the page.
  const view = buildView({ running: RUNNING_RELEASE, target: "windows-x64", stored: next, nowMs: NOW });
  assert.equal(view.headline, "offer");
  assert.match(view.lastCheck.message, /signature/);
});

test("a replayed older feed is refused against the stored rollback floor", async () => {
  const newer = samplePayload({ published: "2026-09-28T08:00:00Z", targets: { "windows-x64": sampleTarget("153.0.8010.70", "2") } });
  const first = await run(recordingFetch(() => fakeResponse(envelopeFor(KEY, newer))));
  assert.equal(first.accepted.published, "2026-09-28T08:00:00Z");
  const replay = await run(recordingFetch(() => fakeResponse(envelopeFor(KEY, samplePayload()))), { stored: first });
  assert.equal(replay.lastCheck.code, "rollback");
  assert.equal(replay.accepted.build.chromium, "153.0.8010.70");
});

test("a signed downgrade is refused and nothing is offered", async () => {
  const older = samplePayload({ targets: { "windows-x64": sampleTarget("152.0.7000.1", "5") } });
  const next = await run(recordingFetch(() => fakeResponse(envelopeFor(KEY, older))));
  assert.equal(next.lastCheck.code, "older");
  assert.equal(next.accepted, null);
  const view = buildView({ running: RUNNING_RELEASE, target: "windows-x64", stored: next, nowMs: NOW });
  assert.equal(view.offer, null);
  assert.equal(view.headline, "error");
});

test("a release build ignores a stored custom address; a dev copy uses it", async () => {
  const release = recordingFetch(() => fakeResponse(envelopeFor(KEY, samplePayload())));
  await run(release, { stored: { feedUrl: "https://swarm.green/browser/smoke/updates.json" } });
  assert.equal(release.calls[0].url, FEED);

  const custom = "https://swarm.green/browser/smoke/updates.json";
  const dev = recordingFetch(() => fakeResponse(envelopeFor(KEY, samplePayload()), { url: custom }));
  const next = await run(dev, { running: RUNNING_DEV, stored: { feedUrl: custom } });
  assert.equal(dev.calls[0].url, custom);
  assert.equal(next.lastCheck.custom, true);
  assert.equal(next.lastCheck.status, "offer");
});

test("a dev copy with a bad custom address asks nothing at all", async () => {
  const fetchImpl = recordingFetch(() => fakeResponse("{}"));
  const next = await run(fetchImpl, { running: RUNNING_DEV, stored: { feedUrl: "https://evil.example/updates.json" } });
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(next.lastCheck.code, "bad_custom_url");
});

test("a build that does not know its version asks nothing at all", async () => {
  const fetchImpl = recordingFetch(() => fakeResponse("{}"));
  const next = await run(fetchImpl, { running: null });
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(next.lastCheck.code, "bad_version");
});

test("the offer disappears by itself once the new build is the running one", async () => {
  const next = await run(recordingFetch(() => fakeResponse(envelopeFor(KEY, samplePayload()))));
  const updated = { chromium: "153.0.8010.60", swarm: "2", channel: "release" };
  const view = buildView({ running: updated, target: "windows-x64", stored: next, nowMs: NOW });
  assert.equal(view.offer, null);
  assert.equal(view.headline, "latest");
});
