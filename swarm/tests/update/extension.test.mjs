/**
 * The extension as shipped: its manifest, its id, its files, and what its
 * code does not do. Read from disk; nothing is loaded into a browser here
 * (the Edge smoke test does that).
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { EXTENSION_DIR } from "./helpers.mjs";
import { FEED_KEYS } from "../../extensions/update/lib/feed-key.js";
import { decodeBase64 } from "../../extensions/update/lib/feed.js";

const EXPECTED_ID = "locbhnoahhmjhcjpndjmnfmnfekhdode";
const manifest = JSON.parse(readFileSync(path.join(EXTENSION_DIR, "manifest.json"), "utf8"));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [path.relative(EXTENSION_DIR, full).split(path.sep).join("/")];
  });
}
const FILES = walk(EXTENSION_DIR).sort();
const read = (relative) => readFileSync(path.join(EXTENSION_DIR, relative), "utf8");

function directives(csp) {
  return Object.fromEntries(
    csp
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name, values.join(" ")];
      }),
  );
}

test("the id is fixed by the manifest key: locbhnoahhmjhcjpndjmnfmnfekhdode", () => {
  // Chromium crx_file/id_util.cc: first 16 bytes of SHA-256 of the DER public
  // key, each hex digit 0-f written as a letter a-p.
  const digest = createHash("sha256").update(Buffer.from(manifest.key, "base64")).digest("hex").slice(0, 32);
  const id = [...digest].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
  assert.equal(id, EXPECTED_ID);
});

test("permissions: alarms, notifications, storage, and nothing else", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual([...manifest.permissions].sort(), ["alarms", "notifications", "storage"]);
  assert.equal(manifest.optional_permissions, undefined);
  assert.equal(manifest.optional_host_permissions, undefined);
  for (const forbidden of ["downloads", "tabs", "history", "webRequest", "webNavigation", "cookies", "management", "nativeMessaging", "scripting"]) {
    assert.ok(!manifest.permissions.includes(forbidden), forbidden);
  }
});

test("the network: swarm.green only, in the host permission and in the CSP", () => {
  assert.deepEqual(manifest.host_permissions, ["https://swarm.green/*"]);
  const csp = directives(manifest.content_security_policy.extension_pages);
  assert.equal(csp["connect-src"], "https://swarm.green");
  assert.equal(csp["script-src"], "'self'");
  assert.equal(csp["object-src"], "'self'");
  assert.doesNotMatch(manifest.content_security_policy.extension_pages, /unsafe|http:|\*|wasm/);
});

test("nothing that could touch a web page or be reached from one", () => {
  assert.deepEqual(manifest.content_scripts, []);
  assert.deepEqual(manifest.web_accessible_resources, []);
  assert.equal(manifest.externally_connectable, undefined);
  assert.equal(manifest.chrome_url_overrides, undefined);
  assert.equal(manifest.background.service_worker, "background.js");
  assert.equal(manifest.background.type, "module");
});

test("version.json is the committed development placeholder", () => {
  assert.deepEqual(JSON.parse(read("version.json")), { chromium: "0.0.0.0", swarm: "0", channel: "dev" });
});

test("the folder holds only what ships: no tests, no package.json, no node_modules, no keys", () => {
  for (const file of FILES) {
    assert.doesNotMatch(file, /(^|\/)(test|tests|node_modules)\//, file);
    assert.doesNotMatch(file, /\.test\.m?js$|package(-lock)?\.json$|\.pem$|\.key$/, file);
  }
  for (const file of FILES.filter((f) => /\.(js|json|html|css)$/.test(f))) {
    assert.doesNotMatch(read(file), /PRIVATE KEY/, file);
  }
});

test("every file the manifest, the pages, the scripts and the stylesheet name exists", () => {
  const named = new Set([
    "background.js",
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ]);
  for (const page of FILES.filter((f) => f.endsWith(".html"))) {
    for (const [, ref] of read(page).matchAll(/(?:src|href)="([^"#][^"]*)"/g)) named.add(ref);
  }
  for (const script of FILES.filter((f) => f.endsWith(".js"))) {
    for (const [, ref] of read(script).matchAll(/from "(\.[^"]+)"/g)) {
      named.add(path.posix.normalize(path.posix.join(path.posix.dirname(script), ref)));
    }
    for (const [, ref] of read(script).matchAll(/getURL\("([^"]+)"\)/g)) if (ref) named.add(ref);
  }
  for (const [, ref] of read("swarm.css").matchAll(/url\("([^"]+)"\)/g)) named.add(ref);
  for (const [, ref] of read("background.js").matchAll(/iconUrl: "([^"]+)"/g)) named.add(ref);
  for (const file of named) assert.ok(FILES.includes(file), `${file} is referenced but missing`);
  // ...and nothing ships that nothing uses.
  for (const file of FILES) {
    if (file === "manifest.json" || file === "version.json" || file === "lib/feed-key.js") continue;
    assert.ok(named.has(file), `${file} ships but nothing refers to it`);
  }
});

test("the code has no way to download, install or phone anywhere else", () => {
  const scripts = FILES.filter((f) => f.endsWith(".js"));
  for (const file of scripts) {
    const source = read(file);
    for (const pattern of [
      /chrome\.downloads/,
      /XMLHttpRequest/,
      /WebSocket/,
      /sendBeacon/,
      /EventSource/,
      /importScripts/,
      /\beval\(/,
      /new Function/,
      /innerHTML/,
      /outerHTML/,
      /document\.write/,
      /chrome\.runtime\.connectNative|sendNativeMessage/,
      /onMessageExternal|onConnectExternal/,
    ]) {
      assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
    }
  }
  // fetch() is called in exactly two places, both in the service worker: the
  // extension's own version.json, and the feed through lib/check.js.
  const calls = scripts.flatMap((file) => [...read(file).matchAll(/\bfetch\(/g)].map(() => file));
  assert.deepEqual(calls, ["background.js", "background.js"]);
  const background = read("background.js");
  assert.match(background, /fetch\(chrome\.runtime\.getURL\("version\.json"\)/);
  assert.match(background, /fetchImpl: \(url, init\) => fetch\(url, init\)/);
});

test("the baked feed keys are well-formed Ed25519 public keys", () => {
  assert.ok(FEED_KEYS.length >= 1 && FEED_KEYS.length <= 3);
  for (const key of FEED_KEYS) {
    assert.match(key.label, /^[a-z0-9][a-z0-9.-]{0,63}$/);
    const raw = decodeBase64(key.publicKey);
    assert.ok(raw && raw.length === 32, key.label);
  }
  assert.equal(new Set(FEED_KEYS.map((key) => key.publicKey)).size, FEED_KEYS.length);
});

test("the pages say the things the plan requires, in plain words", () => {
  const page = read("update.html");
  assert.match(page, /Nothing has been downloaded, and nothing will install itself\./);
  assert.match(page, /Remind me tomorrow/);
  assert.match(page, /SHA-256 to compare/);
  const popup = read("popup.html");
  assert.match(popup, /Check now/);
  const ui = read("ui.js");
  assert.match(ui, /You are on the latest version/);
  assert.match(ui, /Checked \$\{formatWhen/);
});
