/**
 * A fake chrome.* and a fake SWARM price relay for the SWARM Start screenshot
 * harness (screenshots.mjs). Loaded as a classic script in front of the real
 * newtab.html / price.html, so it runs before their modules. Nothing here is
 * shipped: swarm/tests is outside the extension folder.
 *
 * Only the `*-live` states reach the network (one GET to the real relay,
 * read-only); every other state answers the relay URL from the made-up
 * document below, or fails it on purpose. States (?state=):
 *
 *   fresh         the start page with a live price (24 h up)
 *   down          the start page with a falling 24 h change
 *   ageing        relay unreachable, last reading 12 minutes old
 *   stale         relay unreachable, last reading 40 minutes old
 *   unavailable   relay unreachable, last reading 2 hours old
 *   note          the start page with the ⓘ note open
 *   settings      the start page with its settings open (the price switch)
 *   off           "Show SWM price (USD)" switched off: no tile, no request
 *   page          the price page, 24h range
 *   page-30d      the price page, 30d range
 *   page-hover    the price page with the pointer over the chart
 *   page-off      the price page after switching the price off on it
 *   live          the start page against the real relay
 *   page-live     the price page against the real relay
 */
(() => {
  const PRICE_URL = "https://wallet.swarm.green/api/price/swm";
  const state = new URLSearchParams(location.search).get("state") || "fresh";
  const live = state.endsWith("live");
  window.__harness = { state, requests: 0 };

  /** Made-up values in the shape of spec §2.1 + §6.1; not market data. */
  const HOURLY = [
    0.5259, 0.5301, 0.5288, 0.5402, 0.5517, 0.573, 0.5689, 0.5822, 0.6014, 0.6361, 0.6298, 0.6411, 0.6533, 0.6487,
    0.6602, 0.6905, 0.7112, 0.7537, 0.7391, 0.7688, 0.7954, 0.8102, 0.8233, 0.8411, 0.8302, 0.8256, 0.8117, 0.7983,
    0.8044, 0.8195, 0.8231, 0.8378, 0.8302, 0.8159, 0.8077, 0.8124, 0.8263, 0.8302, 0.8415, 0.8489, 0.8377, 0.8302,
    0.8254, 0.8319, 0.8388, 0.8352, 0.8396, 0.8401, 0.8411,
  ];
  const DAILY = [
    0.212, 0.218, 0.209, 0.224, 0.236, 0.241, 0.233, 0.252, 0.268, 0.261, 0.279, 0.301, 0.296, 0.318, 0.342, 0.333,
    0.358, 0.392, 0.377, 0.401, 0.436, 0.452, 0.441, 0.479, 0.512, 0.505, 0.548, 0.573, 0.615, 0.802, 0.8411,
  ];

  function relayDocument(nowS) {
    const hour = Math.floor(nowS / 3600) * 3600;
    const day = Math.floor(nowS / 86400) * 86400;
    const down = state === "down";
    return {
      schema: "swarm-price/1",
      symbol: "SWM",
      quote: "USD",
      price_usd: "0.84114343",
      price_eth: "0.000195976",
      change_pct: down ? { h1: -0.42, h6: -1.9, h24: -3.24 } : { h1: 0.84, h6: 28.75, h24: 36.72 },
      volume_24h_usd: 378.11,
      liquidity_usd: 3761.34,
      fdv_usd: 8411.43,
      source: "geckoterminal",
      sources: [
        { id: "geckoterminal", ok: true, price_usd: "0.84114343", fetched_unix: nowS },
        { id: "dexscreener", ok: true, price_usd: "0.8602", fetched_unix: nowS },
      ],
      // Falling: the same shape upside down, about 3.6 % over 48 h, ending at the price.
      sparkline_usd: down ? HOURLY.slice().reverse().map((v) => Math.round((0.8411 + (v - 0.5259) * 0.1) * 1e4) / 1e4) : HOURLY,
      sparkline_hours: 48,
      hourly_from_unix: hour - 47 * 3600,
      daily_usd: DAILY,
      daily_from_unix: day - 29 * 86400,
      transactions_24h: { buys: 9, sells: 0 },
      pool: { chain: "base", dex: "uniswap-v4", fee_pct: 0.9, created_unix: day - 40 * 86400 },
      generated_unix: nowS,
      refresh_seconds: 30,
      stale: false,
    };
  }

  /** A remembered reading `ageMs` old, in the stored (flat) shape of lib/price.js toStored(). */
  function storedReading(ageMs) {
    const at = Date.now() - ageMs;
    const d = relayDocument(Math.floor(at / 1000));
    return {
      price_usd: d.price_usd,
      generated_unix: d.generated_unix,
      stale: false,
      fetchedAt: at,
      price_eth: d.price_eth,
      change_pct_h1: d.change_pct.h1,
      change_pct_h6: d.change_pct.h6,
      change_pct_h24: d.change_pct.h24,
      sparkline_usd: d.sparkline_usd,
      hourly_from_unix: d.hourly_from_unix,
      daily_usd: d.daily_usd,
      daily_from_unix: d.daily_from_unix,
      transactions_24h: d.transactions_24h,
      liquidity_usd: d.liquidity_usd,
      volume_24h_usd: d.volume_24h_usd,
      fdv_usd: d.fdv_usd,
      fee_pct: 0.9,
      pool_created_unix: d.pool.created_unix,
      sources: d.sources,
      source: d.source,
    };
  }

  const AGE = { ageing: 12 * 60_000, stale: 40 * 60_000, unavailable: 2 * 3600_000 };
  const relayDown = state in AGE;

  /* ── chrome.storage.local, in memory ── */
  const data = {};
  if (state === "off") data.showSwmPrice = false;
  if (relayDown) data.swmPriceLast = storedReading(AGE[state]);
  const listeners = [];
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const local = {
    async get(defaults) {
      const out = {};
      for (const [k, v] of Object.entries(defaults || {})) out[k] = k in data ? clone(data[k]) : v;
      return out;
    },
    async set(obj) {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { oldValue: clone(data[k]), newValue: clone(v) };
        data[k] = clone(v);
      }
      for (const fn of listeners) fn(changes, "local");
    },
  };

  window.chrome = {
    storage: { local, onChanged: { addListener: (fn) => listeners.push(fn) } },
    tabs: {
      getCurrent: async () => ({ id: 1 }),
      update: async () => ({}),
      create: async () => ({}),
    },
    windows: { create: async () => ({}) },
    search: { query: async () => {} },
    runtime: { getURL: (p) => new URL(p, location.href).href },
  };

  /* ── the relay ── */
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, init) => {
    if (String(url) !== PRICE_URL) throw new TypeError(`harness: no request to ${url}`);
    window.__harness.requests += 1;
    if (live) return realFetch(url, init);
    if (relayDown) throw new TypeError("harness: relay unreachable");
    const body = JSON.stringify(relayDocument(Math.floor(Date.now() / 1000)));
    return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
  };

  /* ── interactions for some states, once the page has painted ── */
  const after = (ms, fn) => window.addEventListener("load", () => setTimeout(fn, ms));
  const $ = (id) => document.getElementById(id);
  if (state === "note") after(400, () => $("price-info").click());
  if (state === "settings") after(400, () => $("settings-button").click());
  if (state === "page-30d") after(400, () => document.querySelector('.pp-range[data-range="30d"]').click());
  if (state === "page-off") after(400, () => $("pp-show").click());
  if (state === "page-hover") {
    after(600, () => {
      const svg = $("pp-chart");
      const box = svg.getBoundingClientRect();
      svg.dispatchEvent(new MouseEvent("mousemove", { clientX: box.left + box.width * 0.55, clientY: box.top + 40, bubbles: true }));
    });
  }
})();
