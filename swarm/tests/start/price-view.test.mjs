/**
 * What the SWM price tile and the price page show (lib/price-view.js), from
 * the spec's relay answer and from one real answer of the live relay
 * (fixtures-price-live-pd8.json, read 2026-10-05 20:58 UTC).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import "./helpers.mjs";
import { DEXSCREENER_URL, GECKOTERMINAL_URL, PRICE_NOTE, parsePriceDocument } from "../../extensions/start/lib/price.js";
import {
  CHART_H,
  OFF_TEXT,
  PLOT_W,
  SHOW_PRICE_DEFAULT,
  SOURCES,
  SWITCH_HELP,
  SWITCH_LABEL,
  chartView,
  freshnessLook,
  hoverView,
  isListingUrl,
  keepTogether,
  pageView,
  priceEnabled,
  tileView,
} from "../../extensions/start/lib/price-view.js";

const SPEC_TEXT = readFileSync(new URL("./fixtures-price.json", import.meta.url), "utf8");
const LIVE_TEXT = readFileSync(new URL("./fixtures-price-live-pd8.json", import.meta.url), "utf8");
const T0 = 1791223633 * 1000;
const LIVE_T = 1791234075 * 1000;
const UTC = "UTC";

function spec(fetchedAt = T0) {
  const r = parsePriceDocument(SPEC_TEXT, fetchedAt);
  assert.equal(r.ok, true);
  return r.reading;
}

function live(fetchedAt = LIVE_T) {
  const r = parsePriceDocument(LIVE_TEXT, fetchedAt);
  assert.equal(r.ok, true, r.error);
  return r.reading;
}

const nbsp = (s) => s.replace(/ /g, "\u00a0");

test("the switch: default ON, only a stored boolean changes it", () => {
  assert.equal(SHOW_PRICE_DEFAULT, true);
  assert.equal(priceEnabled(undefined), true);
  assert.equal(priceEnabled(null), true);
  assert.equal(priceEnabled("false"), true, "a damaged value is the default, not off");
  assert.equal(priceEnabled(false), false);
  assert.equal(priceEnabled(true), true);
  assert.equal(SWITCH_LABEL, "Show SWM price (USD)");
  assert.match(SWITCH_HELP, /^The price comes from the SWARM price service \(wallet\.swarm\.green\)/);
  assert.match(SWITCH_HELP, /GeckoTerminal and DexScreener/);
  assert.match(SWITCH_HELP, /SWARM Start makes no price requests/);
  assert.match(OFF_TEXT, /no price requests/);
  assert.equal(PRICE_NOTE, "Indicative price from the SWM/ETH pool on Base. The pool is small; small trades move it. Not a quote.");
});

test("tile, fresh and confirmed: price, chip, sparkline, meta line", () => {
  const v = tileView(spec(), T0 + 12_000, { live: true, attempted: true }, UTC);
  assert.equal(v.value, "$0.8411");
  assert.equal(v.unit, true);
  assert.equal(v.none, false);
  assert.equal(v.greyed, false);
  assert.equal(v.dot, "fresh");
  assert.deepEqual(v.chip, { text: "▲ 36.7 % 24h", direction: "up" });
  assert.ok(v.spark && v.spark.line.startsWith("M0 ") && v.spark.area.endsWith("Z"));
  assert.equal(v.meta, [nbsp("Base"), nbsp("Uniswap v4"), "GeckoTerminal", nbsp("updated 12 s ago")].join(" · "));
});

test("tile: a remembered reading is greyed until this page confirms it", () => {
  const v = tileView(spec(), T0 + 60_000, { live: false, attempted: false }, UTC);
  assert.equal(v.value, "$0.8411");
  assert.equal(v.greyed, true);
  assert.equal(v.dot, "");
});

test("tile: ageing, stale, unavailable, nothing yet", () => {
  const ageing = tileView(spec(), T0 + 12 * 60_000, { live: true, attempted: true }, UTC);
  assert.equal(ageing.dot, "ageing");
  assert.equal(ageing.greyed, false);
  assert.match(ageing.meta, /as\u00a0of\u00a0\d\d:\d\d$/);

  const stale = tileView(spec(), T0 + 40 * 60_000, { live: true, attempted: true }, UTC);
  assert.equal(stale.dot, "");
  assert.equal(stale.greyed, true);
  assert.equal(stale.value, "$0.8411");

  const gone = tileView(spec(), T0 + 2 * 3600_000, { live: true, attempted: true }, UTC);
  assert.equal(gone.value, "Price unavailable");
  assert.equal(gone.none, true);
  assert.equal(gone.chip, null);
  assert.equal(gone.spark, null);
  assert.equal(gone.meta, keepTogether("Base · Uniswap v4 · last reading 18:07"));

  const waiting = tileView(null, T0, { live: false, attempted: false }, UTC);
  assert.equal(waiting.value, "…");
  assert.equal(waiting.unit, true);
  const failed = tileView(null, T0, { live: false, attempted: true }, UTC);
  assert.equal(failed.value, "Price unavailable");
});

test("tile: a falling price, and a flat one", () => {
  const r = spec();
  const down = tileView({ ...r, change_pct_h24: -3.24 }, T0, { live: true }, UTC);
  assert.deepEqual(down.chip, { text: "▼ 3.2 % 24h", direction: "down" });
  const flat = tileView({ ...r, change_pct_h24: 0 }, T0, { live: true }, UTC);
  assert.deepEqual(flat.chip, { text: "0.0 % 24h", direction: "flat" });
  const none = tileView({ ...r, change_pct_h24: null, sparkline_usd: null }, T0, { live: true }, UTC);
  assert.equal(none.chip, null);
  assert.equal(none.spark, null);
});

test("the relay's stale flag greys a fresh fetch", () => {
  const r = { ...spec(), stale: true };
  const f = freshnessLook(r, T0 + 1000, { live: true });
  assert.equal(f.greyed, true);
  assert.equal(f.dot, "");
  assert.equal(f.usable, true);
});

test("page from the live relay: price, ETH, three chips, stats, sources", () => {
  const v = pageView(live(), LIVE_T + 3000, { live: true, attempted: true }, UTC);
  assert.equal(v.value, "$0.9305");
  assert.equal(v.eth, "0.000196 ETH");
  assert.equal(v.fresh, "updated 3 s ago");
  assert.deepEqual(
    v.chips.map((c) => c.change && c.change.text),
    ["0.0 % 1h", "▲ 10.6 % 6h", "▲ 42.4 % 24h"],
  );
  assert.deepEqual(v.stats, {
    liquidity: "$3,837",
    volume: "$482.89",
    fdv: "$9,305",
    trades: "5 / 0",
    fee: "0.9 %",
    network: "Base",
  });
  assert.deepEqual(
    v.sources.map((s) => [s.id, s.name, s.price, s.mark, s.ok, s.url]),
    [
      ["geckoterminal", "GeckoTerminal", "$0.9305", "✓", true, GECKOTERMINAL_URL],
      ["dexscreener", "DexScreener", "$0.9817", "✓", true, DEXSCREENER_URL],
    ],
  );
});

test("page: a failed source is greyed with a dash; nothing yet says it is asking", () => {
  const r = spec();
  const v = pageView({ ...r, sources: [{ ...r.sources[0] }, { id: "dexscreener", ok: false, price_usd: null, fetched_unix: null }] }, T0, { live: true }, UTC);
  assert.deepEqual(v.sources[1], { ...SOURCES[1], ok: false, price: "—", mark: "—" });
  const waiting = pageView(null, T0, {}, UTC);
  assert.equal(waiting.fresh, "asking the SWARM price service…");
  assert.equal(waiting.value, "…");
  assert.equal(waiting.stats, null);
  assert.equal(waiting.eth, null);
  const gone = pageView(spec(), T0 + 2 * 3600_000, { live: true, attempted: true }, UTC);
  assert.equal(gone.value, "Price unavailable");
  assert.equal(gone.fresh, "price unavailable");
  assert.equal(gone.usable, false);
});

test("only the two fixed listing pages may be opened", () => {
  assert.equal(isListingUrl(DEXSCREENER_URL), true);
  assert.equal(isListingUrl(GECKOTERMINAL_URL), true);
  assert.deepEqual(
    SOURCES.map((s) => new URL(s.url).host),
    ["www.geckoterminal.com", "dexscreener.com"],
  );
  for (const bad of ["https://dexscreener.com/", "https://evil.example/base/pools/x", "javascript:alert(1)", undefined]) {
    assert.equal(isListingUrl(bad), false, String(bad));
  }
});

test("chart, live relay: 24h and 48h end at the live price; 30d has the few days there are", () => {
  const r = live();
  const c24 = chartView(r, "24h");
  assert.equal(c24.range, "24h");
  assert.deepEqual(c24.buttons.map((b) => [b.name, b.enabled, b.pressed]), [
    ["24h", true, true],
    ["48h", true, false],
    ["30d", true, false],
  ]);
  assert.equal(c24.series.values.length, 25, "24 hourly closes and the live price");
  assert.equal(c24.series.live, true);
  assert.equal(c24.series.values.at(-1), r.sparkline_usd.at(-1));
  assert.equal(c24.readout, "Last 24 hours");
  assert.equal(c24.end.x, PLOT_W);
  assert.equal(c24.labels[0].id, "latest");
  assert.equal(c24.labels[0].visible, true);
  for (const l of c24.labels) assert.ok(l.y >= 10 && l.y <= CHART_H - 2, `${l.id} y ${l.y}`);

  const c48 = chartView(r, "48h");
  assert.equal(c48.series.values.length, 49);

  const c30 = chartView(r, "30d");
  assert.equal(c30.series.values.length, r.daily_usd.length);
  assert.equal(c30.series.daily, true);
});

test("chart: a range without data is off and the first one with data is drawn", () => {
  const r = { ...spec(), sparkline_usd: null, hourly_from_unix: null };
  const c = chartView(r, "24h");
  assert.deepEqual(c.buttons.map((b) => b.enabled), [false, false, false]);
  assert.equal(c.g, null);
  assert.equal(c.readout, "");
  const r2 = { ...live(), daily_usd: null, daily_from_unix: null };
  const c2 = chartView(r2, "30d");
  assert.equal(c2.range, "24h");
  assert.equal(c2.buttons.find((b) => b.name === "30d").enabled, false);
});

test("chart labels: the latest wins when the highest is the last point", () => {
  const r = { ...spec(), sparkline_usd: [0.5, 0.6, 0.7, 0.8, 0.9] };
  const c = chartView(r, "48h");
  const byId = Object.fromEntries(c.labels.map((l) => [l.id, l]));
  assert.equal(byId.latest.visible, true);
  assert.equal(byId.latest.text, "$0.9000");
  assert.equal(byId.max.visible, false, "max is the latest point");
  assert.equal(byId.min.visible, true);
  assert.equal(byId.min.text, "$0.5000");
});

test("hover: a value and its hour, and 'now' on the live last point", () => {
  const c = chartView(live(), "24h");
  const last = hoverView(c, PLOT_W + 50, UTC);
  assert.equal(last.index, c.series.values.length - 1);
  assert.match(last.text, / · now$/);
  const first = hoverView(c, 0, UTC);
  assert.equal(first.index, 0);
  assert.match(first.text, /^\$0\.\d{4} · \d{1,2} Oct, \d\d:00$/);
  assert.equal(hoverView(null, 10), null);
  assert.equal(hoverView(c, Number.NaN), null);
});

test("keepTogether breaks only between the parts", () => {
  assert.equal(keepTogether("Base · updated 3 s ago"), "Base · updated\u00a03\u00a0s\u00a0ago");
});
