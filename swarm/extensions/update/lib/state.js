/**
 * What SWARM Update remembers, when it asks again, when it reminds, and what
 * the popup and the page show. All of it pure, so node:test can prove it.
 *
 * Stored in chrome.storage.local, and nothing else is:
 *
 *   lastCheck  when the last check ran and how it ended
 *   accepted   the last feed that passed every check: its `published` time
 *              (the rollback floor) and the build it offers for this system
 *   snooze     "Remind me tomorrow": which offer, and until when
 *   notified   which offer was last announced, and when
 *   feedUrl    a development copy only: another swarm.green address to ask
 */

import { buildKey, compareBuilds, parsePublished, parseRunning, parseTarget } from "./feed.js";

export const STORAGE_DEFAULTS = Object.freeze({
  lastCheck: null,
  accepted: null,
  snooze: null,
  notified: null,
  feedUrl: null,
});

/** Once a day. */
export const DAY_MINUTES = 24 * 60;
/** The first check after installation waits for the browser to settle. */
export const FIRST_CHECK_DELAY_MINUTES = 5;
/** "Remind me tomorrow" means 24 hours from the click. */
export const SNOOZE_MS = 24 * 60 * 60 * 1000;
/** An offer is announced again at most about once a day. */
export const RENOTIFY_MS = 20 * 60 * 60 * 1000;

const STATUSES = new Set(["offer", "latest", "no-target"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTime(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function text(value, max = 500) {
  return typeof value === "string" && value.length <= max ? value : null;
}

function normalizeLastCheck(value) {
  if (!isPlainObject(value) || !isTime(value.at)) return null;
  return {
    at: value.at,
    ok: value.ok === true,
    status: STATUSES.has(value.status) ? value.status : null,
    code: text(value.code, 64),
    message: text(value.message),
    detail: text(value.detail),
    published: parsePublished(value.published) === null ? null : value.published,
    url: text(value.url, 2048),
    custom: value.custom === true,
  };
}

function normalizeAccepted(value) {
  if (!isPlainObject(value) || parsePublished(value.published) === null) return null;
  let build = null;
  if (value.build !== null && value.build !== undefined) {
    // Re-checked on the way out of storage, so a damaged value can never put a
    // link on the page that the feed rules would have refused.
    const parsed = parseTarget(value.build);
    if (!parsed.ok) return null;
    build = parsed.target;
  }
  return {
    at: isTime(value.at) ? value.at : null,
    published: value.published,
    target: text(value.target, 64),
    build,
  };
}

function normalizeMark(value, timeField) {
  if (!isPlainObject(value) || typeof value.key !== "string" || !isTime(value[timeField])) return null;
  return { key: value.key, [timeField]: value[timeField] };
}

/** Whatever storage gave back, made safe to use. Junk becomes "nothing". */
export function normalizeStored(value) {
  const stored = isPlainObject(value) ? value : {};
  return {
    lastCheck: normalizeLastCheck(stored.lastCheck),
    accepted: normalizeAccepted(stored.accepted),
    snooze: normalizeMark(stored.snooze, "until"),
    notified: normalizeMark(stored.notified, "at"),
    feedUrl: typeof stored.feedUrl === "string" && stored.feedUrl ? stored.feedUrl : null,
  };
}

/* ── when ───────────────────────────────────────────────────────────────── */

/**
 * Minutes until the daily check should run: a few minutes after installation,
 * otherwise 24 hours after the last one, and never less than a minute.
 */
export function minutesUntilNextCheck(lastCheckAt, nowMs) {
  const last = typeof lastCheckAt === "string" ? Date.parse(lastCheckAt) : Number.NaN;
  if (!Number.isFinite(last)) return FIRST_CHECK_DELAY_MINUTES;
  const elapsed = (nowMs - last) / 60000;
  return Math.min(DAY_MINUTES, Math.max(1, Math.ceil(DAY_MINUTES - elapsed)));
}

export function snoozeFor(key, nowMs) {
  return { key, until: new Date(nowMs + SNOOZE_MS).toISOString() };
}

export function isSnoozed(snooze, key, nowMs) {
  return Boolean(snooze && key && snooze.key === key && Date.parse(snooze.until) > nowMs);
}

/**
 * Whether to show the notification for `offerKey` now: never while snoozed;
 * always for an offer not announced before; again when a snooze taken after
 * the last announcement has run out; otherwise at most once in RENOTIFY_MS.
 */
export function shouldNotify({ offerKey, notified, snooze, nowMs }) {
  if (!offerKey) return false;
  if (isSnoozed(snooze, offerKey, nowMs)) return false;
  if (!notified || notified.key !== offerKey) return true;
  const last = Date.parse(notified.at);
  if (!Number.isFinite(last)) return true;
  if (snooze && snooze.key === offerKey && Date.parse(snooze.until) > last) return true;
  return nowMs - last >= RENOTIFY_MS;
}

/* ── what the pages show ────────────────────────────────────────────────── */

/**
 * Everything the popup and the page need, from the running build, this
 * system's target and what is stored.
 *
 * The offer is worked out here every time, not stored: once the new version
 * is installed, the same stored feed stops being an offer by itself.
 *
 * headline: "offer" | "latest" | "no-target" | "error" | "never" | "unknown-version"
 */
export function buildView({ running, target, stored, nowMs }) {
  const state = normalizeStored(stored);
  const run = parseRunning(running);
  const view = {
    running: run.ok ? { chromium: run.chromium, swarm: run.swarm, channel: run.channel } : null,
    channel: run.ok ? run.channel : null,
    target: target || null,
    lastCheck: state.lastCheck,
    published: state.accepted ? state.accepted.published : null,
    offer: null,
    snoozedUntil: null,
    headline: "never",
  };
  if (!run.ok) {
    view.headline = "unknown-version";
    return view;
  }
  const accepted = state.accepted && state.accepted.target === view.target ? state.accepted : null;
  const build = accepted ? accepted.build : null;
  if (build && compareBuilds(build, run) > 0) {
    view.offer = { ...build, key: buildKey(build), published: accepted.published };
    if (isSnoozed(state.snooze, view.offer.key, nowMs)) view.snoozedUntil = state.snooze.until;
    view.headline = "offer";
  } else if (state.lastCheck && !state.lastCheck.ok) {
    view.headline = "error";
  } else if (accepted) {
    view.headline = build ? "latest" : "no-target";
  } else if (state.lastCheck && state.lastCheck.ok) {
    view.headline = state.lastCheck.status === "no-target" ? "no-target" : "latest";
  }
  return view;
}
