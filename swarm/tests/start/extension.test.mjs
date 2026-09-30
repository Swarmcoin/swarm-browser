/**
 * SWARM Start as a package: its manifest, its fixed id, its destinations, and
 * that the privacy list on screen matches what the browser really compiles in.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { EXTENSIONS_DIR, PATCHES_DIR, START_DIR } from "./helpers.mjs";
import {
  BROWSER_PAGE_URL,
  DESTINATIONS,
  UPDATE_ID,
  WALLET_ID,
  isAllowedDestination,
  updatePopupUrl,
  walletPopupUrl,
} from "../../extensions/start/lib/destinations.js";
import { NOT_YET, PRIVACY_SWITCHES, countLabel, switchCount } from "../../extensions/start/lib/privacy.js";

const manifest = JSON.parse(readFileSync(path.join(START_DIR, "manifest.json"), "utf8"));

function idFromKey(key) {
  const hex = createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
}

test("the key fixes the id recorded in swarm/README.md", () => {
  assert.equal(idFromKey(manifest.key), "fopmngfcphleeiffnfhhahdhafgimnei");
});

test("the wallet and update ids used here are the bundled extensions' real ids", () => {
  for (const [folder, id] of [
    ["wallet", WALLET_ID],
    ["update", UPDATE_ID],
  ]) {
    const other = JSON.parse(readFileSync(path.join(EXTENSIONS_DIR, folder, "manifest.json"), "utf8"));
    assert.equal(idFromKey(other.key), id, folder);
  }
  assert.equal(walletPopupUrl(), `chrome-extension://${WALLET_ID}/popup.html`);
  assert.equal(updatePopupUrl(), `chrome-extension://${UPDATE_ID}/popup.html`);
});

test("manifest: new tab, side panel, toolbar button, nothing web-accessible", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "SWARM Start");
  assert.equal(manifest.chrome_url_overrides.newtab, "newtab.html");
  assert.equal(manifest.side_panel.default_path, "navigator.html");
  assert.equal(manifest.action.default_title, "SWARM Navigator");
  assert.equal(manifest.action.default_popup, undefined, "the button opens the panel, not a popup");
  assert.deepEqual([...manifest.permissions].sort(), ["search", "sidePanel", "storage"]);
  assert.deepEqual(manifest.web_accessible_resources, []);
  assert.deepEqual(manifest.content_scripts, []);
  assert.equal(manifest.externally_connectable, undefined);
});

test("manifest: the only servers it may reach are the two status files", () => {
  assert.deepEqual(manifest.host_permissions, [
    "https://lwd-main.swarm.green/status.json",
    "https://swarm.green/data/swarm-map-live.json",
  ]);
  const csp = manifest.content_security_policy.extension_pages;
  const connect = csp.split(";").map((s) => s.trim()).find((s) => s.startsWith("connect-src"));
  assert.equal(connect, "connect-src https://lwd-main.swarm.green https://swarm.green");
  assert.match(csp, /script-src 'self';/);
});

test("every file the manifest and pages name exists", () => {
  const files = new Set();
  const walk = (dir, prefix = "") => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix + entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel + "/");
      else files.add(rel);
    }
  };
  walk(START_DIR);
  for (const icon of Object.values(manifest.icons)) assert.ok(files.has(icon), icon);
  for (const icon of Object.values(manifest.action.default_icon)) assert.ok(files.has(icon), icon);
  for (const page of ["newtab.html", "navigator.html", "welcome.html", "privacy.html", manifest.background.service_worker]) {
    assert.ok(files.has(page), page);
  }
  for (const page of ["newtab.html", "navigator.html", "welcome.html", "privacy.html"]) {
    const html = readFileSync(path.join(START_DIR, page), "utf8");
    for (const [, ref] of html.matchAll(/(?:src|href)="([^"#:]+)(?:#[^"]*)?"/g)) {
      assert.ok(files.has(ref), `${page} -> ${ref}`);
    }
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, `${page}: no inline script (CSP script-src 'self')`);
    assert.doesNotMatch(html, /\bstyle="/, `${page}: no inline style (CSP style-src 'self')`);
  }
});

test("no visible string names Google, ungoogled or Chromium", () => {
  for (const file of ["newtab.html", "navigator.html", "welcome.html", "privacy.html", "lib/privacy.js", "lib/destinations.js"]) {
    const text = readFileSync(path.join(START_DIR, file), "utf8");
    assert.doesNotMatch(text, /google|chromium/i, file);
  }
});

test("destinations: seven, https, SWARM hosts only, FUEL left out, market labelled testnet", () => {
  assert.deepEqual(
    DESTINATIONS.map((d) => d.label),
    ["swarm.green", "Explorer", "Wallet", "Messenger", "Node and mining", "Market", "Support"],
  );
  for (const d of DESTINATIONS) {
    if (d.open === "url") assert.ok(isAllowedDestination(d.url), d.url);
    else assert.equal(d.open, "wallet");
  }
  assert.equal(DESTINATIONS.find((d) => d.id === "explorer").url, "https://mainnet.explore.swarm.green/");
  assert.equal(DESTINATIONS.find((d) => d.id === "market").badge, "testnet");
  assert.ok(!DESTINATIONS.some((d) => /fuel/i.test(JSON.stringify(d))));
  assert.ok(isAllowedDestination(BROWSER_PAGE_URL));
  for (const bad of ["http://swarm.green/", "https://evil.example/", "javascript:alert(1)", "https://swarm.green.evil.example/"]) {
    assert.equal(isAllowedDestination(bad), false, bad);
  }
});

test("the privacy list says exactly what swarm-privacy-defaults.patch switches on", () => {
  const patch = readFileSync(path.join(PATCHES_DIR, "swarm-privacy-defaults.patch"), "utf8");
  const added = patch.split("\n").filter((l) => l.startsWith("+")).join("\n");
  const evidence = {
    "https-first": /prefs::kHttpsOnlyModeEnabled, true/,
    "no-pings": /AppendSwitch\("no-pings"\)/,
    webrtc: /"webrtc-ip-handling-policy", "default_public_interface_only"/,
    "search-engines": /"disable-search-engine-collection"\);/,
    referrers: /"NoCrossOriginReferrers",\r?\n-\s+base::FEATURE_DISABLED_BY_DEFAULT\);\r?\n\+\s+base::FEATURE_ENABLED_BY_DEFAULT/,
    "client-hints": /kRemoveClientHints, "RemoveClientHints", base::FEATURE_ENABLED_BY_DEFAULT/,
    "system-info": /kReducedSystemInfo, "ReducedSystemInfo", base::FEATURE_ENABLED_BY_DEFAULT/,
  };
  assert.deepEqual(PRIVACY_SWITCHES.map((s) => s.id).sort(), Object.keys(evidence).sort());
  for (const [id, re] of Object.entries(evidence)) assert.match(id === "referrers" ? patch : added, re, id);
  assert.equal(switchCount(), 7);
  assert.equal(countLabel(), "7 privacy switches on");
  assert.equal(countLabel(1), "1 privacy switch on");
  assert.ok(NOT_YET.some((l) => /ad or tracker blocking/.test(l)));
});
