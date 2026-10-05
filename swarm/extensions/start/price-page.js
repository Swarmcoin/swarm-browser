/**
 * The SWM price page of SWARM Start (price.html; specs/PRICE-DISPLAY.md §6.2,
 * §7). Opened from the price tile on the new-tab page.
 *
 * What it sends anywhere: while "Show SWM price (USD)" is on, one GET to
 * https://wallet.swarm.green/api/price/swm when it opens and once a minute
 * while it is in view (lib/price-feed.js), nothing about the person. Off = no
 * request; the page then shows only the note and the switch. The two listing
 * links and the pool and token ids are constants in lib/price.js, never taken
 * from the relay's answer.
 *
 * SWARM Start shows no balance (swarm/README.md, "A live wallet tile"), so the
 * spec's "Your balance" row is left out here; the wallet's own price page has it.
 */
import { POOL_ID, PRICE_NOTE, TOKEN_CONTRACT, fetchPrice, shortHex } from "./lib/price.js";
import { createPriceFeed } from "./lib/price-feed.js";
import { CHART_W, OFF_TEXT, SOURCES, chartView, hoverView, isListingUrl, pageView } from "./lib/price-view.js";

const $ = (id) => document.getElementById(id);

/** Shows or hides an HTML or SVG element (SVG elements have no .hidden). */
function show(node, visible) {
  node.toggleAttribute("hidden", !visible);
}

const chart = { range: "24h", view: null, hoverX: null };

const feed = createPriceFeed({
  storage: chrome.storage.local,
  fetchPrice: () => fetchPrice(),
  isVisible: () => document.visibilityState === "visible",
  onChange: paint,
});

/* ── painting ───────────────────────────────────────────────────────── */

function paint(f) {
  $("pp-show").checked = f.enabled;
  const on = f.loaded && f.enabled;
  show($("pp-body"), on);
  show($("pp-freshline"), on);
  show($("pp-off"), f.loaded && !f.enabled);
  if (!on) {
    chart.view = null;
    return;
  }
  const v = pageView(f.reading, Date.now(), f);
  $("pp").classList.toggle("greyed", v.greyed);
  $("pp-dot").setAttribute("class", v.dot ? `dot ${v.dot}` : "dot");
  $("pp-fresh").textContent = v.fresh;

  const value = $("pp-value");
  value.textContent = v.value;
  value.classList.toggle("none", v.none);
  show($("pp-unit"), v.unit);
  if (!v.none && f.landed) {
    // The one animation on the page: a fresh price fades in.
    value.classList.remove("landed");
    void value.offsetWidth;
    value.classList.add("landed");
  }
  $("pp-eth").textContent = v.eth || "";
  show($("pp-eth"), !!v.eth);
  for (const { id, change } of v.chips) {
    const chip = $(`pp-${id}`);
    show(chip, !!change);
    if (change) {
      chip.textContent = change.text;
      chip.className = `price-chip ${change.direction}`;
    }
  }

  show($("pp-chart-card"), v.usable);
  show($("pp-stats"), v.usable);
  if (v.usable) {
    paintChart(f.reading);
    $("pp-volume").textContent = v.stats.volume;
    $("pp-fdv").textContent = v.stats.fdv;
    $("pp-trades").textContent = v.stats.trades;
    $("pp-fee").textContent = v.stats.fee;
  } else {
    chart.view = null;
  }

  for (const s of v.sources) {
    $(`pp-src-${s.id}-price`).textContent = s.price;
    $(`pp-src-${s.id}-mark`).textContent = s.mark;
    $(`pp-src-${s.id}`).classList.toggle("failed", !s.ok);
  }
}

function paintChart(reading) {
  const c = chartView(reading, chart.range);
  for (const button of document.querySelectorAll(".pp-range")) {
    const b = c.buttons.find((x) => x.name === button.dataset.range);
    button.disabled = !b || !b.enabled;
    button.setAttribute("aria-pressed", String(!!b && b.pressed));
  }
  chart.view = c.g ? c : null;
  show($("pp-chart"), !!c.g);
  show($("pp-nochart"), !c.g);
  if (!c.g) {
    $("pp-readout").textContent = "";
    return;
  }
  $("pp-line").setAttribute("d", c.g.line);
  $("pp-area").setAttribute("d", c.g.area);
  c.g.guides.forEach((y, i) => {
    $(`pp-guide-${i}`).setAttribute("y1", y);
    $(`pp-guide-${i}`).setAttribute("y2", y);
  });
  $("pp-end").setAttribute("cx", c.end.x);
  $("pp-end").setAttribute("cy", c.end.y);
  for (const label of c.labels) {
    const node = $(`pp-label-${label.id}`);
    show(node, label.visible);
    node.textContent = label.text;
    node.setAttribute("y", String(label.y));
  }
  if (chart.hoverX === null) $("pp-readout").textContent = c.readout;
  else hoverAt(chart.hoverX);
}

function hoverAt(x) {
  const h = hoverView(chart.view, x);
  if (!h) return;
  $("pp-cursor").setAttribute("x1", h.x);
  $("pp-cursor").setAttribute("x2", h.x);
  $("pp-hover").setAttribute("cx", h.x);
  $("pp-hover").setAttribute("cy", h.y);
  show($("pp-cursor"), true);
  show($("pp-hover"), true);
  $("pp-readout").textContent = h.text;
}

function endHover() {
  chart.hoverX = null;
  show($("pp-cursor"), false);
  show($("pp-hover"), false);
  $("pp-readout").textContent = chart.view ? chart.view.readout : "";
}

/* ── wiring ─────────────────────────────────────────────────────────── */

async function back() {
  if (history.length > 1) {
    history.back();
    return;
  }
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab) {
      await chrome.tabs.update(tab.id, { url: "chrome://newtab/" });
      return;
    }
  } catch (_) {
    /* fall through to the page itself */
  }
  window.location.assign("newtab.html");
}

async function copy(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
  } catch (_) {
    button.textContent = "Copy failed";
  }
  setTimeout(() => {
    button.textContent = "Copy";
  }, 1500);
}

function wire() {
  $("pp-back").addEventListener("click", back);
  $("pp-note").textContent = PRICE_NOTE;
  $("pp-off").textContent = OFF_TEXT;
  for (const s of SOURCES) {
    if (isListingUrl(s.url)) $(`pp-src-${s.id}`).href = s.url;
  }
  $("pp-pool").textContent = shortHex(POOL_ID);
  $("pp-pool").title = POOL_ID;
  $("pp-token").textContent = shortHex(TOKEN_CONTRACT);
  $("pp-token").title = TOKEN_CONTRACT;
  $("pp-pool-copy").addEventListener("click", (e) => copy(POOL_ID, e.currentTarget));
  $("pp-token-copy").addEventListener("click", (e) => copy(TOKEN_CONTRACT, e.currentTarget));
  for (const button of document.querySelectorAll(".pp-range")) {
    button.addEventListener("click", () => {
      chart.range = button.dataset.range;
      endHover();
      paint(feed);
    });
  }
  const svg = $("pp-chart");
  svg.addEventListener("mousemove", (e) => {
    const box = svg.getBoundingClientRect();
    if (!box.width) return;
    chart.hoverX = ((e.clientX - box.left) * CHART_W) / box.width;
    hoverAt(chart.hoverX);
  });
  svg.addEventListener("mouseleave", endHover);
  $("pp-show").addEventListener("change", (e) => feed.setEnabled(e.target.checked));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") feed.storageChanged(changes);
  });
  document.addEventListener("visibilitychange", () => feed.visibilityChanged());
}

wire();
feed.start();
