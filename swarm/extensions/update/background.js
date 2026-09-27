/**
 * SWARM Update, the service worker.
 *
 * Once a day it reads https://swarm.green/browser/updates.json, checks the
 * Ed25519 signature against the key baked into lib/feed-key.js, and, when the
 * list names a newer SWARM Browser for this system, shows a notification and a
 * badge that lead to update.html: the version, the download link and the
 * SHA-256 to compare.
 *
 * It never downloads anything and never installs anything. There is no
 * `downloads` permission, and the only two things it ever fetches are the
 * feed and its own version.json. Getting the new version is a link the person
 * clicks, like any other download.
 *
 * Permissions: `alarms` (the daily check and "Remind me tomorrow"),
 * `notifications` (the offer), `storage` (lib/state.js lists everything kept).
 * Host permission and the manifest's connect-src: https://swarm.green, and
 * nothing else. No tabs, no history, no content scripts: nothing here can see
 * what anyone browses.
 */

import { runCheck } from "./lib/check.js";
import { FEED_KEYS } from "./lib/feed-key.js";
import { targetFor } from "./lib/feed.js";
import {
  DAY_MINUTES,
  STORAGE_DEFAULTS,
  buildView,
  minutesUntilNextCheck,
  normalizeStored,
  shouldNotify,
  snoozeFor,
} from "./lib/state.js";

const ALARM_DAILY = "swarm.update.daily";
const ALARM_REMIND = "swarm.update.remind";
const NOTIFICATION_ID = "swarm.update.offer";
const BADGE_COLOR = "#FF8A1F";
/** "Check now" is a button, not a way to hammer swarm.green. */
const MANUAL_MIN_INTERVAL_MS = 10 * 1000;

/* ── reading ────────────────────────────────────────────────────────────── */

/**
 * The running build: version.json from this extension's own package, which
 * install_swarm_assets.py stamps with the real version at build time.
 *
 * The manifest's connect-src names only https://swarm.green. Reading a file
 * of this extension still works, because chrome-extension: is registered as a
 * CSP-bypassing scheme (chrome/common/chrome_content_client.cc); it is not a
 * network request.
 */
async function readRunning() {
  try {
    const response = await fetch(chrome.runtime.getURL("version.json"), { cache: "no-store" });
    return await response.json();
  } catch (_) {
    return null;
  }
}

/** "windows-x64" for the x64 Windows build: the architecture is compiled in. */
async function readTarget() {
  try {
    const info = await chrome.runtime.getPlatformInfo();
    return targetFor(info.os, info.arch);
  } catch (_) {
    return null;
  }
}

async function readStored() {
  return chrome.storage.local.get({ ...STORAGE_DEFAULTS });
}

async function currentView() {
  const [running, target, stored] = await Promise.all([readRunning(), readTarget(), readStored()]);
  return buildView({ running, target, stored, nowMs: Date.now() });
}

/* ── telling the person ─────────────────────────────────────────────────── */

async function refreshBadge(view) {
  const show = Boolean(view.offer) && !view.snoozedUntil;
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  await chrome.action.setBadgeText({ text: show ? "1" : "" });
  await chrome.action.setTitle({
    title: view.offer ? `SWARM Update: ${view.offer.chromium} is available` : "SWARM Update",
  });
}

/**
 * Badge always; notification only when lib/state.js says it is time (not
 * while snoozed, not twice within a day for the same version).
 */
async function announce(view, { allowNotify }) {
  await refreshBadge(view);
  if (!view.offer) {
    await chrome.notifications.clear(NOTIFICATION_ID);
    return;
  }
  if (!allowNotify) return;
  const nowMs = Date.now();
  const stored = normalizeStored(await readStored());
  if (!shouldNotify({ offerKey: view.offer.key, notified: stored.notified, snooze: stored.snooze, nowMs })) return;
  await chrome.notifications.create(NOTIFICATION_ID, {
    type: "basic",
    iconUrl: "icons/update-128.png",
    title: `SWARM Browser ${view.offer.chromium} is available`,
    message: "Nothing has been downloaded. Open this to see the download link and the SHA-256 to compare.",
    buttons: [{ title: "See the download" }, { title: "Remind me tomorrow" }],
    priority: 0,
  });
  await chrome.storage.local.set({ notified: { key: view.offer.key, at: new Date(nowMs).toISOString() } });
}

function openOfferPage() {
  chrome.notifications.clear(NOTIFICATION_ID);
  chrome.tabs.create({ url: chrome.runtime.getURL("update.html") });
}

/* ── checking ───────────────────────────────────────────────────────────── */

let inflight = null;

/** One check at a time; a second request while one runs gets the same answer. */
function check(reason) {
  if (!inflight) {
    inflight = doCheck(reason).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function doCheck(reason) {
  const [running, target, stored] = await Promise.all([readRunning(), readTarget(), readStored()]);
  const nowMs = Date.now();
  const before = normalizeStored(stored);
  if (reason === "manual" && before.lastCheck && nowMs - Date.parse(before.lastCheck.at) < MANUAL_MIN_INTERVAL_MS) {
    return buildView({ running, target, stored, nowMs });
  }
  const next = await runCheck({
    fetchImpl: (url, init) => fetch(url, init),
    subtle: crypto.subtle,
    nowMs,
    running,
    target,
    stored,
    publicKeys: FEED_KEYS.map((key) => key.publicKey),
  });
  await chrome.storage.local.set({ lastCheck: next.lastCheck, accepted: next.accepted });
  const view = buildView({ running, target, stored: { ...stored, ...next }, nowMs });
  // Someone who pressed "Check now" is looking at the answer already.
  await announce(view, { allowNotify: reason !== "manual" });
  return view;
}

async function snooze() {
  const view = await currentView();
  if (!view.offer) return view;
  const mark = snoozeFor(view.offer.key, Date.now());
  await chrome.storage.local.set({ snooze: mark });
  await chrome.alarms.clear(ALARM_REMIND);
  await chrome.alarms.create(ALARM_REMIND, { when: Date.parse(mark.until) });
  await chrome.notifications.clear(NOTIFICATION_ID);
  const after = await currentView();
  await refreshBadge(after);
  return after;
}

/* ── schedule ───────────────────────────────────────────────────────────── */

async function ensureAlarms() {
  const stored = normalizeStored(await readStored());
  if (!(await chrome.alarms.get(ALARM_DAILY))) {
    await chrome.alarms.create(ALARM_DAILY, {
      delayInMinutes: minutesUntilNextCheck(stored.lastCheck && stored.lastCheck.at, Date.now()),
      periodInMinutes: DAY_MINUTES,
    });
  }
  if (stored.snooze && Date.parse(stored.snooze.until) > Date.now() && !(await chrome.alarms.get(ALARM_REMIND))) {
    await chrome.alarms.create(ALARM_REMIND, { when: Date.parse(stored.snooze.until) });
  }
}

async function start() {
  await ensureAlarms();
  await announce(await currentView(), { allowNotify: true });
}

chrome.runtime.onInstalled.addListener(() => {
  start();
});

chrome.runtime.onStartup.addListener(() => {
  start();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm) return;
  if (alarm.name === ALARM_DAILY) check("daily");
  if (alarm.name === ALARM_REMIND) currentView().then((view) => announce(view, { allowNotify: true }));
});

chrome.notifications.onClicked.addListener((id) => {
  if (id === NOTIFICATION_ID) openOfferPage();
});

chrome.notifications.onButtonClicked.addListener((id, index) => {
  if (id !== NOTIFICATION_ID) return;
  if (index === 0) openOfferPage();
  else snooze();
});

/**
 * The popup and update.html ask here, so the alarms, the badge and the
 * notification are managed in one place. Only this extension's own pages are
 * answered; nothing listens for other extensions or for web pages at all.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string" || !message.type.startsWith("swarm.update.")) return false;
  const ownPages = chrome.runtime.getURL("");
  if (!sender || sender.id !== chrome.runtime.id || typeof sender.url !== "string" || !sender.url.startsWith(ownPages)) {
    return false;
  }
  let work;
  if (message.type === "swarm.update.view") work = currentView();
  else if (message.type === "swarm.update.check") work = check("manual");
  else if (message.type === "swarm.update.snooze") work = snooze();
  else return false;
  work.then(
    (view) => sendResponse({ ok: true, view }),
    (error) => sendResponse({ ok: false, error: String((error && error.message) || error) }),
  );
  return true;
});
