/**
 * When SWARM Start asks the SWARM price service (lib/price-feed.js): with fake
 * timers, a fake chrome.storage.local, a fake relay and a fake visibility.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import "./helpers.mjs";
import { LAST_PRICE_KEY, POLL_MS, SHOW_PRICE_KEY, parsePriceDocument, toStored } from "../../extensions/start/lib/price.js";
import { createPriceFeed } from "../../extensions/start/lib/price-feed.js";
import { REPAINT_MS } from "../../extensions/start/lib/price-view.js";

const SPEC_TEXT = readFileSync(new URL("./fixtures-price.json", import.meta.url), "utf8");
const T0 = 1791223633 * 1000;

function reading(fetchedAt) {
  return parsePriceDocument(SPEC_TEXT, fetchedAt).reading;
}

/** A small world: a clock, intervals, a storage, a relay, a tab that is in view or not. */
function world({ stored = {}, relay = "ok", visible = true, storageFails = false } = {}) {
  const w = {
    t: T0,
    visible,
    relay,
    calls: 0,
    data: { ...stored },
    timers: new Map(),
    nextId: 1,
    paints: 0,
    painted: [],
  };
  w.storage = {
    async get(defaults) {
      if (storageFails) throw new Error("no storage");
      const out = {};
      for (const [k, v] of Object.entries(defaults)) out[k] = k in w.data ? w.data[k] : v;
      return out;
    },
    async set(obj) {
      Object.assign(w.data, obj);
    },
  };
  w.feed = createPriceFeed({
    storage: w.storage,
    fetchPrice: async () => {
      w.calls += 1;
      if (w.relay === "ok") return { ok: true, reading: reading(w.t) };
      if (w.relay === "throw") throw new Error("boom");
      return { ok: false, error: "relay answered 503" };
    },
    isVisible: () => w.visible,
    onChange: (f) => {
      w.paints += 1;
      w.painted.push({ live: f.live, at: f.reading ? f.reading.fetchedAt : null });
    },
    now: () => w.t,
    setInterval: (fn, ms) => {
      const id = w.nextId++;
      w.timers.set(id, { fn, ms, next: w.t + ms });
      return id;
    },
    clearInterval: (id) => {
      w.timers.delete(id);
    },
  });
  /** Moves the clock on, firing the intervals that fall due, and lets promises settle. */
  w.advance = async (ms) => {
    const end = w.t + ms;
    for (;;) {
      const due = [...w.timers.values()].filter((x) => x.next <= end).sort((a, b) => a.next - b.next)[0];
      if (!due) break;
      w.t = due.next;
      due.next += due.ms;
      due.fn();
      await settle();
    }
    w.t = end;
    await settle();
  };
  w.intervals = () => [...w.timers.values()].map((x) => x.ms).sort((a, b) => a - b);
  return w;
}

async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

test("default: switch unset -> on; one request at once, the answer is remembered", async () => {
  const w = world();
  await w.feed.start();
  await settle();
  assert.equal(w.feed.enabled, true);
  assert.equal(w.calls, 1);
  assert.equal(w.feed.live, true);
  assert.equal(w.feed.reading.price_usd, "0.84114343");
  assert.deepEqual(w.data[LAST_PRICE_KEY], toStored(w.feed.reading));
  assert.deepEqual(w.intervals(), [REPAINT_MS, POLL_MS]);
});

test("then once a minute while in view", async () => {
  const w = world();
  await w.feed.start();
  await settle();
  await w.advance(POLL_MS * 3);
  assert.equal(w.calls, 4);
});

test("switched off: no request at all, no timers, nothing painted as a price", async () => {
  const w = world({ stored: { [SHOW_PRICE_KEY]: false, [LAST_PRICE_KEY]: toStored(reading(T0 - 1000)) } });
  await w.feed.start();
  await w.advance(POLL_MS * 5);
  assert.equal(w.feed.enabled, false);
  assert.equal(w.feed.reading, null, "the remembered reading is not even loaded");
  assert.equal(w.calls, 0);
  assert.deepEqual(w.intervals(), []);
});

test("storage that cannot be read means OFF, not a request", async () => {
  const w = world({ storageFails: true });
  await w.feed.start();
  await w.advance(POLL_MS * 2);
  assert.equal(w.feed.enabled, false);
  assert.equal(w.calls, 0);
});

test("a background tab asks nothing; coming into view asks at once", async () => {
  const w = world({ visible: false });
  await w.feed.start();
  await w.advance(POLL_MS * 4);
  assert.equal(w.calls, 0);
  assert.deepEqual(w.intervals(), []);
  w.visible = true;
  w.feed.visibilityChanged();
  await settle();
  assert.equal(w.calls, 1);
  w.visible = false;
  w.feed.visibilityChanged();
  await w.advance(POLL_MS * 4);
  assert.equal(w.calls, 1, "hidden again: the timers stop");
  assert.deepEqual(w.intervals(), []);
});

test("first paint is the remembered reading, greyed until confirmed; then one request", async () => {
  const old = reading(T0 - 90_000);
  const w = world({ stored: { [LAST_PRICE_KEY]: toStored(old) } });
  await w.feed.start();
  await settle();
  assert.deepEqual(w.painted[0], { live: false, at: T0 - 90_000 }, "first paint: remembered, not live");
  assert.equal(w.calls, 1);
  assert.equal(w.feed.live, true);
  assert.equal(w.feed.reading.fetchedAt, T0);
});

test("a reading under 20 s old from another tab counts as fresh: no request", async () => {
  const w = world({ stored: { [LAST_PRICE_KEY]: toStored(reading(T0 - 5_000)) } });
  await w.feed.start();
  await settle();
  assert.equal(w.calls, 0);
  assert.equal(w.feed.live, true);
  await w.advance(POLL_MS);
  assert.equal(w.calls, 1, "the minute's request still comes");
});

test("a failed or refused answer keeps the last good reading", async () => {
  const w = world();
  await w.feed.start();
  await settle();
  w.relay = "fail";
  await w.advance(POLL_MS);
  assert.equal(w.calls, 2);
  assert.equal(w.feed.reading.fetchedAt, T0);
  w.relay = "throw";
  await w.advance(POLL_MS);
  assert.equal(w.calls, 3);
  assert.equal(w.feed.reading.fetchedAt, T0);
  assert.equal(w.feed.attempted, true);
});

test("switching off stops everything at once and is stored; on again asks", async () => {
  const w = world();
  await w.feed.start();
  await settle();
  await w.feed.setEnabled(false);
  assert.equal(w.data[SHOW_PRICE_KEY], false);
  assert.deepEqual(w.intervals(), []);
  await w.advance(POLL_MS * 3);
  assert.equal(w.calls, 1);
  w.t += 60_000;
  await w.feed.setEnabled(true);
  await settle();
  assert.equal(w.data[SHOW_PRICE_KEY], true);
  assert.equal(w.calls, 2);
});

test("another SWARM Start page flips the switch or stores a newer reading", async () => {
  const w = world();
  await w.feed.start();
  await settle();
  w.feed.storageChanged({ [SHOW_PRICE_KEY]: { newValue: false } });
  assert.equal(w.feed.enabled, false);
  assert.deepEqual(w.intervals(), []);
  w.feed.storageChanged({ [SHOW_PRICE_KEY]: { newValue: true } });
  await settle();
  assert.equal(w.feed.enabled, true);
  const newer = reading(w.t + 1);
  w.t += 2;
  w.feed.storageChanged({ [LAST_PRICE_KEY]: { newValue: toStored(newer) } });
  assert.equal(w.feed.reading.fetchedAt, newer.fetchedAt);
  w.feed.storageChanged({ [LAST_PRICE_KEY]: { newValue: { price_usd: "-1" } } });
  assert.equal(w.feed.reading.fetchedAt, newer.fetchedAt, "garbage from storage is ignored");
});

test("nothing is asked before the switch has been read", async () => {
  const w = world();
  w.feed.visibilityChanged();
  await w.feed.poll();
  assert.equal(w.calls, 0);
});
