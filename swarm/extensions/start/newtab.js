/**
 * SWARM Start, the new-tab page.
 *
 * What this page sends anywhere: nothing, unless the person turns on
 * "Network now" in its settings; then two GETs per new tab, to the public
 * status files named in lib/format.js, without cookies or a referrer.
 * Searching hands the text to the browser's default search engine
 * (chrome.search.query), exactly as the address bar would.
 */
import { decide } from "./lib/query.js";
import { DEFAULTS, STORAGE_KEY, normalize, withChange, motionAllowed } from "./lib/settings.js";
import { MAP_URL, STATUS_URL, networkSummary } from "./lib/format.js";
import { countLabel, switchCount } from "./lib/privacy.js";
import { DESTINATIONS } from "./lib/destinations.js";
import { openDestination, openSettings, openWallet } from "./open.js";

const $ = (id) => document.getElementById(id);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let settings = { ...DEFAULTS };

/* ── settings ───────────────────────────────────────────────────────── */

async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get({ [STORAGE_KEY]: null });
    return normalize(stored[STORAGE_KEY]);
  } catch (_) {
    return { ...DEFAULTS };
  }
}

function applySettings() {
  const root = document.documentElement;
  root.classList.toggle("bg", settings.background);
  root.classList.toggle("motion", motionAllowed(settings, reducedMotion.matches));
  for (const input of document.querySelectorAll("#settings input[data-key]")) {
    input.checked = Boolean(settings[input.dataset.key]);
  }
  $("set-motion").disabled = !settings.background;
  showNetwork();
}

async function change(key, value) {
  settings = withChange(settings, key, value);
  applySettings();
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

function wireSettings() {
  const button = $("settings-button");
  const panel = $("settings");
  const close = (focusButton) => {
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (focusButton) button.focus();
  };
  button.addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) panel.querySelector("input").focus();
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close(true);
  });
  document.addEventListener("click", (event) => {
    if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) close(false);
  });
  for (const input of panel.querySelectorAll("input[data-key]")) {
    input.addEventListener("change", () => change(input.dataset.key, input.checked));
  }
  reducedMotion.addEventListener("change", applySettings);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) {
      settings = normalize(changes[STORAGE_KEY].newValue);
      applySettings();
    }
  });
}

/* ── search ─────────────────────────────────────────────────────────── */

function wireSearch() {
  $("search").addEventListener("submit", async (event) => {
    event.preventDefault();
    const choice = decide($("q").value);
    if (choice.kind === "url") {
      const tab = await chrome.tabs.getCurrent();
      if (tab) await chrome.tabs.update(tab.id, { url: choice.url });
      else window.location.assign(choice.url);
    } else if (choice.kind === "search") {
      await chrome.search.query({ text: choice.text, disposition: "CURRENT_TAB" });
    }
  });
  $("choose-engine").addEventListener("click", () => openSettings("search"));
}

/* ── shortcuts ──────────────────────────────────────────────────────── */

function icon(id, extraClass) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  if (extraClass) svg.setAttribute("class", extraClass);
  if (id === "i-mark") svg.setAttribute("viewBox", "0 0 1000 467.95");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `icons.svg#${id}`);
  svg.append(use);
  return svg;
}

function renderShortcuts() {
  const list = $("shortcuts");
  for (const d of DESTINATIONS) {
    const li = document.createElement("li");
    const el = d.open === "url" ? document.createElement("a") : document.createElement("button");
    el.className = "shortcut";
    el.dataset.id = d.id;
    el.title = d.note;
    if (d.open === "url") {
      el.href = d.url;
    } else {
      el.type = "button";
      el.addEventListener("click", () => openDestination(d));
    }
    const box = document.createElement("span");
    box.className = "tile-ico";
    box.append(icon(d.icon, d.icon === "i-mark" ? "mark" : ""));
    const label = document.createElement("span");
    label.textContent = d.label;
    el.append(box, label);
    if (d.badge) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = d.badge;
      el.append(badge);
    }
    li.append(el);
    list.append(li);
  }
}

/* ── tiles ──────────────────────────────────────────────────────────── */

let networkLoaded = false;

async function fetchJson(url) {
  try {
    const response = await fetch(url, { credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
    if (!response.ok) return null;
    return await response.json();
  } catch (_) {
    return null;
  }
}

async function loadNetwork() {
  networkLoaded = true;
  $("net-updated").textContent = "Reading SWARM mainnet…";
  const [status, map] = await Promise.all([fetchJson(STATUS_URL), fetchJson(MAP_URL)]);
  const summary = networkSummary(status, map, Date.now());
  if (!summary.ok) {
    $("net-height").textContent = "—";
    $("net-nodes").textContent = "—";
    $("net-updated").textContent = summary.message;
    return;
  }
  $("net-height").textContent = summary.height;
  $("net-nodes").textContent = summary.nodesOnline;
  $("net-updated").textContent = summary.updated
    ? `SWARM mainnet, updated ${summary.updated}. From lwd-main.swarm.green and swarm.green.`
    : "SWARM mainnet. From lwd-main.swarm.green and swarm.green.";
}

function showNetwork() {
  const on = settings.networkTile;
  $("network-off").hidden = on;
  $("network-on-view").hidden = !on;
  if (on && !networkLoaded) loadNetwork();
}

function wireTiles() {
  $("open-wallet").addEventListener("click", () => openWallet());
  $("network-on").addEventListener("click", () => change("networkTile", true));
  const n = switchCount();
  $("privacy-count").textContent = String(n);
  $("privacy-label").textContent = countLabel(n).replace(/^\d+\s*/, "");
}

/* ── start ──────────────────────────────────────────────────────────── */

renderShortcuts();
wireSearch();
wireSettings();
wireTiles();
loadSettings().then((loaded) => {
  settings = loaded;
  applySettings();
});
