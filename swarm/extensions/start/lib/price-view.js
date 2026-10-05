/**
 * What the SWM price tile on SWARM Start and the price page (price.html) show,
 * worked out from a reading of lib/price.js (specs/PRICE-DISPLAY.md §3, §6.2,
 * §7). Pure: no DOM, no chrome.*, no clock of its own, so every state can be
 * tested with `node --test`. newtab.js and price-page.js only copy these
 * answers into the page.
 *
 * `look` is what the page knows besides the reading:
 *   live       a reading arrived (or was confirmed) while this page was open;
 *              until then a remembered reading is greyed (spec §2.2)
 *   attempted  one request finished while this page was open, so "…" may
 *              become "Price unavailable"
 */
import {
  DEXSCREENER_URL,
  FRESHNESS,
  GECKOTERMINAL_URL,
  PRICE_NOTE,
  SOURCE_NAMES,
  chartGeometry,
  classify,
  clockTime,
  formatChange,
  formatEthPrice,
  formatPointTime,
  formatUsdAmount,
  formatUsdPrice,
  formatUsdValue,
  freshnessText,
  nearestIndex,
  pickRange,
  rangeSeries,
  availableRanges,
  RANGES,
  sparklinePaths,
} from "./price.js";

/** The switch's default: ON, as in every SWARM wallet (spec §2.2). */
export const SHOW_PRICE_DEFAULT = true;

/** The switch's label and its help text (spec §2.2, said for SWARM Start). */
export const SWITCH_LABEL = "Show SWM price (USD)";
export const SWITCH_HELP =
  "The price comes from the SWARM price service (wallet.swarm.green), which reads the SWM/ETH pool on Base " +
  "from GeckoTerminal and DexScreener. Nothing about you is sent. Switch this off and SWARM Start makes no " +
  "price requests. The SWARM Wallet has its own switch in its Settings.";
export const OFF_TEXT = "The price is switched off. SWARM Start makes no price requests.";
export { PRICE_NOTE };

/** How often "updated 12 s ago" is repainted. The request itself is once a minute. */
export const REPAINT_MS = 5000;

/** The stored switch: anything but an explicit false is the default, ON. */
export function priceEnabled(stored) {
  return typeof stored === "boolean" ? stored : SHOW_PRICE_DEFAULT;
}

/**
 * The tile's meta line: "GeckoTerminal · updated 12 s ago". Not lib/price.js
 * metaLine(), which also names the chain and the exchange: the owner's
 * amendment of 2026-10-05 21:0x UTC shows no network data and no liquidity.
 */
export function tileMeta(reading, nowMs, timeZone) {
  const parts = [];
  if (reading && reading.source) parts.push(SOURCE_NAMES[reading.source]);
  parts.push(freshnessText(reading, nowMs, timeZone));
  return parts.join(" · ");
}

/** The meta line wraps only between its parts, never inside "updated 12 s ago". */
export function keepTogether(line) {
  return String(line)
    .split(" · ")
    .map((part) => part.replace(/ /g, " "))
    .join(" · ");
}

/**
 * Freshness, greying and the dot, shared by the tile and the page.
 * dot: "fresh" (accent), "ageing" (amber) or "" (grey).
 */
export function freshnessLook(reading, nowMs, { live = false } = {}) {
  const freshness = classify(reading, nowMs);
  const usable = !!reading && freshness !== FRESHNESS.UNAVAILABLE;
  const greyed = !usable || freshness === FRESHNESS.STALE || !live;
  let dot = "";
  if (usable && freshness === FRESHNESS.FRESH && live) dot = "fresh";
  else if (usable && freshness === FRESHNESS.AGEING) dot = "ageing";
  return { freshness, usable, greyed, dot };
}

/** The price tile on the Start page (spec §3, card). */
export function tileView(reading, nowMs, { live = false, attempted = false } = {}, timeZone) {
  const f = freshnessLook(reading, nowMs, { live });
  if (f.usable) {
    const spark = reading.sparkline_usd ? sparklinePaths(reading.sparkline_usd, TILE_SPARK_W, TILE_SPARK_H) : null;
    return {
      ...f,
      value: formatUsdPrice(reading.price_usd),
      none: false,
      unit: true,
      chip: formatChange(reading.change_pct_h24, "24h"),
      spark,
      meta: keepTogether(tileMeta(reading, nowMs, timeZone)),
    };
  }
  const waiting = !attempted && !reading;
  return {
    ...f,
    value: waiting ? "…" : "Price unavailable",
    none: !waiting,
    unit: waiting,
    chip: null,
    spark: null,
    meta: keepTogether(
      reading ? `last reading ${clockTime(reading.fetchedAt, timeZone)}` : "SWARM price service",
    ),
  };
}

/** The tile's sparkline viewBox. The SVG stretches to the tile's width. */
export const TILE_SPARK_W = 300;
export const TILE_SPARK_H = 46;

/** The two aggregators, in the order the page lists them, with their fixed listing pages. */
export const SOURCES = Object.freeze([
  Object.freeze({ id: "geckoterminal", name: SOURCE_NAMES.geckoterminal, url: GECKOTERMINAL_URL }),
  Object.freeze({ id: "dexscreener", name: SOURCE_NAMES.dexscreener, url: DEXSCREENER_URL }),
]);

/** Only the two fixed listing pages may be opened from the page; nothing the relay says. */
export function isListingUrl(url) {
  return url === DEXSCREENER_URL || url === GECKOTERMINAL_URL;
}

/**
 * The price page above the chart, the stats and the sources (spec §6.2 as
 * amended: no liquidity and no network row).
 */
export function pageView(reading, nowMs, { live = false, attempted = false } = {}, timeZone) {
  const f = freshnessLook(reading, nowMs, { live });
  const r = f.usable ? reading : null;
  const fresh = !reading && !attempted ? "asking the SWARM price service…" : freshnessText(reading, nowMs, timeZone);
  const value = r ? formatUsdPrice(r.price_usd) : !reading && !attempted ? "…" : "Price unavailable";
  const chips = [
    ["h1", r ? r.change_pct_h1 : null, "1h"],
    ["h6", r ? r.change_pct_h6 : null, "6h"],
    ["h24", r ? r.change_pct_h24 : null, "24h"],
  ].map(([id, pct, label]) => ({ id, change: formatChange(pct, label) }));
  const stats = r
    ? {
        volume: formatUsdAmount(r.volume_24h_usd),
        fdv: formatUsdAmount(r.fdv_usd),
        trades: r.transactions_24h ? `${r.transactions_24h.buys} / ${r.transactions_24h.sells}` : "—",
        fee: r.fee_pct === null ? "—" : `${Math.round(r.fee_pct * 100) / 100} %`,
      }
    : null;
  const sources = SOURCES.map((s) => {
    const got = reading && reading.sources ? reading.sources.find((x) => x.id === s.id) : null;
    const ok = !!got && got.ok && !!got.price_usd;
    return { ...s, ok, price: ok ? formatUsdPrice(got.price_usd) : "—", mark: ok ? "✓" : "—" };
  });
  return {
    ...f,
    fresh,
    value,
    none: !r,
    unit: !!r,
    eth: r && r.price_eth ? formatEthPrice(r.price_eth) : null,
    chips,
    stats,
    sources,
  };
}

/* ── the page's chart ─────────────────────────────────────────────────── */

/** The chart's viewBox: the plot, then a gutter on the right for the labels. */
export const CHART_W = 640;
export const CHART_H = 200;
export const PLOT_W = 560;
const LABEL_GAP = 12;
export const RANGE_TEXT = Object.freeze({ "24h": "Last 24 hours", "48h": "Last 48 hours", "30d": "Last 30 days" });

/**
 * Everything the chart draws for one reading and the range asked for: which
 * range buttons are on, the paths, the end dot, the three edge labels (the
 * latest wins when two would overlap), and the default readout. Null `g` when
 * there is nothing to draw.
 */
export function chartView(reading, wanted) {
  const ok = availableRanges(reading);
  const range = pickRange(reading, wanted);
  const buttons = RANGES.map((name) => ({ name, enabled: !!ok[name], pressed: name === range }));
  const series = range ? rangeSeries(reading, range) : null;
  const g = series ? chartGeometry(series.values, { width: PLOT_W, height: CHART_H, padTop: 14, padBottom: 14 }) : null;
  if (!g) return { range, buttons, series: null, g: null, end: null, labels: [], readout: "" };
  const n = series.values.length;
  const [endX, endY] = g.points[n - 1];
  const maxY = g.points[g.maxIndex][1];
  const minY = g.points[g.minIndex][1];
  const apart = (a, b) => Math.abs(a - b) >= LABEL_GAP;
  const at = (y) => Math.min(CHART_H - 2, Math.max(10, y + 4));
  const labels = [
    { id: "latest", text: formatUsdValue(series.values[n - 1]) || "", y: at(endY), visible: true },
    { id: "max", text: formatUsdValue(g.max) || "", y: at(maxY), visible: g.maxIndex !== n - 1 && apart(maxY, endY) },
    {
      id: "min",
      text: formatUsdValue(g.min) || "",
      y: at(minY),
      visible: g.minIndex !== n - 1 && apart(minY, endY) && apart(minY, maxY),
    },
  ];
  return { range, buttons, series, g, end: { x: endX, y: endY }, labels, readout: RANGE_TEXT[range] };
}

/**
 * The hover readout for the point nearest `x` (viewBox units): "$0.8106 · 5 Oct,
 * 14:00", and "now" for the last point, which is the live price when the relay
 * appended it (spec §6.1).
 */
export function hoverView(chart, x, timeZone) {
  if (!chart || !chart.g || !chart.series) return null;
  const n = chart.series.values.length;
  const i = nearestIndex(Math.min(x, PLOT_W), n, PLOT_W);
  if (i === null) return null;
  const [px, py] = chart.g.points[i];
  const value = formatUsdValue(chart.series.values[i]);
  let when = null;
  if (i === n - 1) when = "now";
  else if (chart.series.times && chart.series.times[i] !== null) {
    when = formatPointTime(chart.series.times[i], chart.series.daily, timeZone);
  }
  return { index: i, x: px, y: py, text: when ? `${value} · ${when}` : value };
}
