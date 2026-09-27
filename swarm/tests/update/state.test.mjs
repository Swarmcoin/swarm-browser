/**
 * What is remembered, when to check, when to remind, and what the pages say.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { RUNNING_DEV, RUNNING_RELEASE, sampleTarget } from "./helpers.mjs";
import {
  DAY_MINUTES,
  FIRST_CHECK_DELAY_MINUTES,
  RENOTIFY_MS,
  SNOOZE_MS,
  STORAGE_DEFAULTS,
  buildView,
  isSnoozed,
  minutesUntilNextCheck,
  normalizeStored,
  shouldNotify,
  snoozeFor,
} from "../../extensions/update/lib/state.js";

const NOW = Date.UTC(2026, 8, 28, 9, 0, 0);
const HOUR = 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

function acceptedFor(build = sampleTarget(), published = "2026-09-27T18:00:00Z") {
  return { at: iso(NOW - HOUR), published, target: "windows-x64", build };
}

test("storage holds five things, all empty at first", () => {
  assert.deepEqual(Object.keys(STORAGE_DEFAULTS).sort(), ["accepted", "feedUrl", "lastCheck", "notified", "snooze"]);
  assert.deepEqual(normalizeStored({ ...STORAGE_DEFAULTS }), {
    lastCheck: null,
    accepted: null,
    snooze: null,
    notified: null,
    feedUrl: null,
  });
  assert.deepEqual(normalizeStored(undefined), normalizeStored({}));
  assert.deepEqual(normalizeStored("junk"), normalizeStored({}));
});

test("damaged storage is dropped, never shown", () => {
  const stored = normalizeStored({
    lastCheck: { at: "yesterday", ok: true },
    accepted: { published: "2026-09-27T18:00:00Z", target: "windows-x64", build: { ...sampleTarget(), notes: "https://evil.example/" } },
    snooze: { key: 5, until: iso(NOW) },
    notified: { key: "x", at: "never" },
    feedUrl: 42,
  });
  assert.deepEqual(stored, { lastCheck: null, accepted: null, snooze: null, notified: null, feedUrl: null });
});

test("a stored accepted build is re-checked against the feed rules", () => {
  const good = normalizeStored({ accepted: acceptedFor() });
  assert.deepEqual(good.accepted.build, sampleTarget());
  const bad = sampleTarget();
  bad.installer.url = "http://github.com/Swarm-Official/x.exe";
  assert.equal(normalizeStored({ accepted: acceptedFor(bad) }).accepted, null);
});

/* ── when to check ──────────────────────────────────────────────────────── */

test("the first check waits a few minutes, then it is once a day", () => {
  assert.equal(FIRST_CHECK_DELAY_MINUTES, 5);
  assert.equal(DAY_MINUTES, 1440);
  assert.equal(minutesUntilNextCheck(null, NOW), 5);
  assert.equal(minutesUntilNextCheck("garbage", NOW), 5);
  assert.equal(minutesUntilNextCheck(iso(NOW), NOW), 1440);
  assert.equal(minutesUntilNextCheck(iso(NOW - HOUR), NOW), 1380);
  assert.equal(minutesUntilNextCheck(iso(NOW - 23.99 * HOUR), NOW), 1);
  // Overdue (the browser was closed for days): as soon as possible.
  assert.equal(minutesUntilNextCheck(iso(NOW - 72 * HOUR), NOW), 1);
  // A clock that went backwards never pushes the check past a day.
  assert.equal(minutesUntilNextCheck(iso(NOW + 72 * HOUR), NOW), 1440);
});

/* ── remind me tomorrow ─────────────────────────────────────────────────── */

test("'Remind me tomorrow' is 24 hours for that one version", () => {
  const snooze = snoozeFor("153.0.8010.60+2", NOW);
  assert.equal(SNOOZE_MS, 24 * HOUR);
  assert.equal(snooze.until, iso(NOW + 24 * HOUR));
  assert.equal(isSnoozed(snooze, "153.0.8010.60+2", NOW + 23 * HOUR), true);
  assert.equal(isSnoozed(snooze, "153.0.8010.60+2", NOW + 24 * HOUR), false);
  // A different, newer version is not covered by an old snooze.
  assert.equal(isSnoozed(snooze, "153.0.8010.70+2", NOW + HOUR), false);
});

test("an offer is announced once, again about daily, never while snoozed", () => {
  const key = "153.0.8010.60+2";
  assert.equal(shouldNotify({ offerKey: null, notified: null, snooze: null, nowMs: NOW }), false);
  assert.equal(shouldNotify({ offerKey: key, notified: null, snooze: null, nowMs: NOW }), true);
  const notified = { key, at: iso(NOW) };
  assert.equal(shouldNotify({ offerKey: key, notified, snooze: null, nowMs: NOW + HOUR }), false);
  assert.equal(shouldNotify({ offerKey: key, notified, snooze: null, nowMs: NOW + RENOTIFY_MS }), true);
  // A newer version is news at once.
  assert.equal(shouldNotify({ offerKey: "153.0.8010.70+2", notified, snooze: null, nowMs: NOW + HOUR }), true);
  // Snoozed: silent until the snooze ends, then reminded straight away.
  const snooze = snoozeFor(key, NOW + HOUR);
  assert.equal(shouldNotify({ offerKey: key, notified, snooze, nowMs: NOW + 2 * HOUR }), false);
  assert.equal(shouldNotify({ offerKey: key, notified, snooze, nowMs: NOW + 25 * HOUR }), true);
});

/* ── what the pages say ─────────────────────────────────────────────────── */

function view(stored, running = RUNNING_RELEASE, nowMs = NOW) {
  return buildView({ running, target: "windows-x64", stored, nowMs });
}

test("never checked", () => {
  const v = view({});
  assert.equal(v.headline, "never");
  assert.equal(v.offer, null);
  assert.deepEqual(v.running, { chromium: "153.0.8010.52", swarm: "1", channel: "release" });
});

test("a newer accepted build is an offer, with its key and published time", () => {
  const v = view({ accepted: acceptedFor(), lastCheck: { at: iso(NOW), ok: true, status: "offer" } });
  assert.equal(v.headline, "offer");
  assert.equal(v.offer.key, "153.0.8010.60+2");
  assert.equal(v.offer.published, "2026-09-27T18:00:00Z");
  assert.equal(v.snoozedUntil, null);
});

test("a snoozed offer says until when", () => {
  const snooze = snoozeFor("153.0.8010.60+2", NOW - HOUR);
  const v = view({ accepted: acceptedFor(), snooze });
  assert.equal(v.headline, "offer");
  assert.equal(v.snoozedUntil, snooze.until);
});

test("the same build as the running one is 'latest'", () => {
  const same = sampleTarget("153.0.8010.52", "1");
  const v = view({ accepted: acceptedFor(same), lastCheck: { at: iso(NOW), ok: true, status: "latest" } });
  assert.equal(v.headline, "latest");
  assert.equal(v.offer, null);
});

test("a failed check with nothing accepted is an error, with the reason", () => {
  const v = view({ lastCheck: { at: iso(NOW), ok: false, code: "not_published", message: "SWARM has not published an update list yet." } });
  assert.equal(v.headline, "error");
  assert.equal(v.lastCheck.code, "not_published");
});

test("a feed with nothing for this system says so", () => {
  const v = view({ accepted: { ...acceptedFor(), build: null }, lastCheck: { at: iso(NOW), ok: true, status: "no-target" } });
  assert.equal(v.headline, "no-target");
});

test("an unknown running version is said plainly, and nothing is offered", () => {
  const v = view({ accepted: acceptedFor() }, { chromium: "?", swarm: "1", channel: "release" });
  assert.equal(v.headline, "unknown-version");
  assert.equal(v.offer, null);
  assert.equal(v.running, null);
});

test("a development copy shows its channel and treats every listed build as newer", () => {
  const v = view({ accepted: acceptedFor() }, RUNNING_DEV);
  assert.equal(v.channel, "dev");
  assert.equal(v.headline, "offer");
});

test("an accepted build for another system is not offered here", () => {
  const v = view({ accepted: { ...acceptedFor(), target: "linux-x64" } });
  assert.equal(v.offer, null);
});
