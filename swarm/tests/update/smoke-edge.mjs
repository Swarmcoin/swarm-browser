#!/usr/bin/env node
/**
 * SWARM Update, in a real browser: Microsoft Edge with a disposable profile
 * and --load-extension. Not part of `node --test`; run it by hand:
 *
 *   node swarm/tests/update/smoke-edge.mjs
 *
 * What it proves, against a local HTTPS server that plays swarm.green:
 *
 *   Phase 1, the committed development copy (version.json channel "dev"):
 *     1. the extension loads with the fixed id locbhnoahhmjhcjpndjmnfmnfekhdode;
 *     2. pointed (chrome.storage.local feedUrl) at a feed whose payload was
 *        altered after signing, it refuses it and offers nothing;
 *     3. pointed at a feed signed with the development key, offering a newer
 *        build, the popup shows the offer and the badge; the daily-alarm path
 *        raises the notification;
 *     4. update.html shows the version, the download links, the SHA-256 to
 *        compare and the sentence that nothing was downloaded;
 *     5. "Remind me tomorrow" snoozes for 24 hours and clears notification
 *        and badge;
 *     6. a validly signed but OLDER feed (a rollback) is refused and the offer
 *        stands;
 *     7. nothing was downloaded: no download event, an empty download folder,
 *        and the server saw nothing but GETs of the feed, without cookies,
 *        referrer, query string or language list.
 *   Phase 2, a release copy (version.json stamped by install_swarm_assets.py):
 *     8. the stored custom address is ignored: only
 *        https://swarm.green/browser/updates.json is asked, and a feed naming
 *        the running build gives "You are on the latest version".
 *
 * swarm.green is mapped to 127.0.0.1 with --host-resolver-rules, and the
 * server's self-signed certificate is accepted with
 * --ignore-certificate-errors-spki-list for that one key only, so the
 * extension runs with its real manifest: the same CSP (connect-src
 * https://swarm.green) and host permission it ships with.
 *
 * Needs: Edge (SMOKE_BROWSER to use another Chromium), playwright-core
 * (PLAYWRIGHT_CORE, else found in the npx cache), openssl (Git for Windows
 * has one), Python for the release stamp, and the development feed key
 * (SWARM_FEED_KEY, default D:/swarm-work/keys/update-feed-dev.pem).
 * Screenshots and a JSON report go to SMOKE_DIR (default D:/swarm-work/smoke)
 * as 05-update-*. The profiles and every temporary file are deleted after.
 */

import { spawnSync } from "node:child_process";
import { X509Certificate, createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const EXTENSION_DIR = path.join(REPO_ROOT, "swarm", "extensions", "update");
const UPDATES = path.join(REPO_ROOT, "swarm", "updates");
const EXPECTED_ID = "locbhnoahhmjhcjpndjmnfmnfekhdode";

const BROWSER = process.env.SMOKE_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const SMOKE_DIR = process.env.SMOKE_DIR || "D:/swarm-work/smoke";
const PREFIX = process.env.SMOKE_PREFIX || "05-update";
const KEY = process.env.SWARM_FEED_KEY || "D:/swarm-work/keys/update-feed-dev.pem";
const HEADLESS = !process.env.SMOKE_HEADED;

const CUSTOM_PATH = "/browser/smoke/updates.json";
const DEFAULT_PATH = "/browser/updates.json";
const CUSTOM_URL = `https://swarm.green${CUSTOM_PATH}`;
const MANUAL_GAP_MS = 10500; // background.js: "Check now" is honoured at most every 10 s

const report = { started: new Date().toISOString(), browser: BROWSER, headless: HEADLESS, checks: [], screenshots: [] };
const WORK = mkdtempSync(path.join(os.tmpdir(), "swarm-update-smoke-"));

/* ── small helpers ──────────────────────────────────────────────────────── */

function check(name, ok, detail = "") {
  report.checks.push({ name, ok: Boolean(ok), detail: String(detail) });
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}\n`);
  if (!ok) throw new Error(`check failed: ${name} ${detail}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(what, fn, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what}`);
}

function findPlaywright() {
  const roots = [
    path.join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx"),
    "D:/swarm-work/npm-cache/_npx",
  ];
  const found = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      const candidate = path.join(root, dir, "node_modules", "playwright-core");
      if (existsSync(path.join(candidate, "index.mjs"))) {
        const { version } = JSON.parse(readFileSync(path.join(candidate, "package.json"), "utf8"));
        found.push({ candidate, version });
      }
    }
  }
  found.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  if (!found.length) throw new Error("playwright-core not found; set PLAYWRIGHT_CORE to its folder");
  return found[0].candidate;
}

function findOpenssl() {
  for (const candidate of [
    "C:/Program Files/Git/mingw64/bin/openssl.exe",
    "C:/Program Files/Git/usr/bin/openssl.exe",
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return "openssl";
}

function tool(name, args) {
  const run = spawnSync(process.execPath, [path.join(UPDATES, name), ...args], { encoding: "utf8" });
  if (run.status !== 0) throw new Error(`${name} failed: ${run.stderr || run.stdout}`);
  return run.stdout;
}

const isoSeconds = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const sha = (text) => createHash("sha256").update(text).digest("hex");

/** A feed made and signed by the real tools, with the development key. */
function feed(name, { chromium, swarm, published }) {
  const tag = `browser-${chromium}-${swarm}`;
  const base = `https://github.com/Swarm-Official/swarm-releases/releases/download/${tag}`;
  const installer = { url: `${base}/SWARM-Browser-${chromium}-${swarm}-win-x64.exe`, sha256: sha(`installer ${tag}`), size: 157286400 };
  const portable = { url: `${base}/SWARM-Browser-${chromium}-${swarm}-win-x64.zip`, sha256: sha(`portable ${tag}`), size: 167772160 };
  const notes = `https://github.com/Swarm-Official/swarm-releases/releases/tag/${tag}`;
  const payloadFile = path.join(WORK, `${name}.payload.json`);
  const feedFile = path.join(WORK, `${name}.json`);
  tool("make-feed.mjs", [
    "--out", payloadFile, "--published", published, "--chromium", chromium, "--swarm", swarm,
    "--installer-url", installer.url, "--installer-sha256", installer.sha256, "--installer-size", String(installer.size),
    "--portable-url", portable.url, "--portable-sha256", portable.sha256, "--portable-size", String(portable.size),
    "--notes", notes,
  ]);
  tool("sign-feed.mjs", ["--key", KEY, "--payload", payloadFile, "--out", feedFile]);
  return { body: readFileSync(feedFile), chromium, swarm, published, installer, portable, notes };
}

/** The same feed with its payload altered after signing: a different download address. */
function tampered(original) {
  const envelope = JSON.parse(original.body.toString("utf8"));
  const text = Buffer.from(envelope.payload, "base64").toString("utf8");
  const evil = text.replace(original.installer.url, original.installer.url.replace("/download/", "/download/x"));
  if (evil === text) throw new Error("tamper did not change the payload");
  envelope.payload = Buffer.from(evil, "utf8").toString("base64");
  return { ...original, body: Buffer.from(JSON.stringify(envelope)) };
}

/* ── the stand-in swarm.green ───────────────────────────────────────────── */

function certificate() {
  const key = path.join(WORK, "tls-key.pem");
  const cert = path.join(WORK, "tls-cert.pem");
  const run = spawnSync(findOpenssl(), [
    "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes",
    "-keyout", key, "-out", cert, "-days", "2", "-subj", "/CN=swarm.green",
    "-addext", "subjectAltName=DNS:swarm.green",
  ], { encoding: "utf8" });
  if (run.status !== 0) throw new Error(`openssl failed: ${run.stderr}`);
  const pem = readFileSync(cert, "utf8");
  const spki = new X509Certificate(pem).publicKey.export({ type: "spki", format: "der" });
  return { key: readFileSync(key), cert: pem, spki: createHash("sha256").update(spki).digest("base64") };
}

const routes = new Map();
const requests = [];
let phase = "setup";

function startServer(tls) {
  const server = https.createServer({ key: tls.key, cert: tls.cert }, (req, res) => {
    requests.push({ phase, method: req.method, url: req.url, headers: req.headers });
    const body = routes.get(req.url);
    if (!body) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

/* ── the browser ────────────────────────────────────────────────────────── */

async function launch(chromium, extensionDir, profileName, port, spki, downloads) {
  const context = await chromium.launchPersistentContext(path.join(WORK, profileName), {
    executablePath: BROWSER,
    headless: HEADLESS,
    acceptDownloads: true,
    downloadsPath: downloads,
    viewport: { width: 900, height: 1100 },
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      `--host-resolver-rules=MAP swarm.green 127.0.0.1:${port}`,
      `--ignore-certificate-errors-spki-list=${spki}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--window-position=-2400,-2400",
    ],
  });
  const downloadEvents = [];
  const watch = (page) => page.on("download", (download) => downloadEvents.push(download.url()));
  context.pages().forEach(watch);
  context.on("page", watch);
  let worker = context.serviceWorkers().find((w) => w.url().startsWith("chrome-extension://"));
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 30000 });
  const id = new URL(worker.url()).host;
  return { context, worker, id, downloadEvents };
}

async function shot(page, name, fullPage = false) {
  const file = path.join(SMOKE_DIR, `${PREFIX}-${name}.png`);
  await page.screenshot({ path: file, fullPage });
  report.screenshots.push(file);
  return file;
}

const storage = (worker) => worker.evaluate(() => chrome.storage.local.get(null));

/* ── the run ────────────────────────────────────────────────────────────── */

async function main() {
  mkdirSync(SMOKE_DIR, { recursive: true });
  const playwright = process.env.PLAYWRIGHT_CORE || findPlaywright();
  const { chromium } = await import(pathToFileURL(path.join(playwright, "index.mjs")).href);
  report.playwright = playwright;
  check("development feed key present, outside the repository", existsSync(KEY), KEY);

  const tls = certificate();
  const server = await startServer(tls);
  const port = server.address().port;
  report.server = `127.0.0.1:${port} as swarm.green`;

  const now = Date.now();
  const offer = feed("offer", { chromium: "153.0.8010.99", swarm: "7", published: isoSeconds(now - 60000) });
  const rollback = feed("rollback", { chromium: "153.0.8010.98", swarm: "7", published: isoSeconds(now - 2 * 86400000) });
  const bad = tampered(offer);

  /* Phase 1: the committed development copy. */
  phase = "dev";
  const devExtension = path.join(WORK, "ext-dev");
  cpSync(EXTENSION_DIR, devExtension, { recursive: true });
  const devDownloads = path.join(WORK, "downloads-dev");
  mkdirSync(devDownloads);
  routes.set(CUSTOM_PATH, bad.body);
  const dev = await launch(chromium, devExtension, "profile-dev", port, tls.spki, devDownloads);
  try {
    check("extension loaded with the fixed id", dev.id === EXPECTED_ID, dev.id);
    const version = await dev.worker.evaluate(() => fetch(chrome.runtime.getURL("version.json")).then((r) => r.json()));
    check("version.json read from the package under connect-src https://swarm.green", version.channel === "dev", JSON.stringify(version));
    await dev.worker.evaluate((url) => chrome.storage.local.set({ feedUrl: url }), CUSTOM_URL);

    const popup = await dev.context.newPage();
    await popup.setViewportSize({ width: 380, height: 600 });
    await popup.goto(`chrome-extension://${dev.id}/popup.html`);
    await popup.waitForSelector("#headline:has-text('Not checked yet')");

    // 2. altered after signing
    await popup.click("#check");
    await popup.waitForSelector("#headline:has-text('The last check did not work')", { timeout: 30000 });
    let state = await storage(dev.worker);
    check("tampered feed refused as bad_signature", state.lastCheck && state.lastCheck.code === "bad_signature", state.lastCheck && state.lastCheck.code);
    check("tampered feed offered nothing", !state.accepted && !(await popup.isVisible("#offer")));
    await shot(popup, "popup-rejected");

    // 3. the signed offer
    routes.set(CUSTOM_PATH, offer.body);
    await sleep(MANUAL_GAP_MS);
    await popup.click("#check");
    await popup.waitForSelector("#offer:not(.hidden)", { timeout: 30000 });
    const offerText = await popup.textContent("#offer-version");
    check("popup shows the offer", offerText === "153.0.8010.99 · SWARM 7", offerText);
    state = await storage(dev.worker);
    check("offer accepted from the custom (dev) address", state.lastCheck.url === CUSTOM_URL && state.lastCheck.custom === true, state.lastCheck.url);
    const badge = await dev.worker.evaluate(() => chrome.action.getBadgeText({}));
    check("toolbar badge shows the offer", badge === "1", JSON.stringify(badge));
    await shot(popup, "popup-offer");

    // the daily-alarm path raises the notification
    await dev.worker.evaluate(() => chrome.alarms.create("swarm.update.daily", { when: Date.now() + 1000, periodInMinutes: 1440 }));
    const notified = await until("the notification", async () => {
      const all = await dev.worker.evaluate(() => chrome.notifications.getAll());
      return all && all["swarm.update.offer"] ? all : null;
    }, 30000);
    state = await storage(dev.worker);
    check("daily check notified once", Boolean(notified["swarm.update.offer"]) && state.notified && state.notified.key === "153.0.8010.99+7", JSON.stringify(state.notified));

    // 4. the offer page
    const page = await dev.context.newPage();
    await page.goto(`chrome-extension://${dev.id}/update.html`);
    await page.waitForSelector("#offer:not(.hidden)");
    check("offer page: version", (await page.textContent("#offer-version")) === "153.0.8010.99 · SWARM 7");
    check("offer page: installer SHA-256", (await page.textContent("#installer-sha")) === offer.installer.sha256, offer.installer.sha256);
    check("offer page: portable SHA-256", (await page.textContent("#portable-sha")) === offer.portable.sha256);
    check("offer page: installer link", (await page.getAttribute("#installer-link", "href")) === offer.installer.url);
    check("offer page: portable link", (await page.getAttribute("#portable-link", "href")) === offer.portable.url);
    check("offer page: notes link", (await page.getAttribute("#notes-link", "href")) === offer.notes);
    const nothing = await page.textContent("#nothing");
    check("offer page: says nothing was downloaded or will install", /Nothing has been downloaded, and nothing will install itself\./.test(nothing));
    check("offer page: has Remind me tomorrow", (await page.textContent("#snooze")).trim() === "Remind me tomorrow");
    await shot(page, "offer", true);

    // 5. remind me tomorrow
    const before = Date.now();
    await page.click("#snooze");
    await page.waitForSelector("#snoozed:not(.hidden)");
    state = await storage(dev.worker);
    const until24 = Date.parse(state.snooze.until) - before;
    check("snoozed for 24 hours", state.snooze.key === "153.0.8010.99+7" && until24 > 23.9 * 3600000 && until24 < 24.1 * 3600000, state.snooze.until);
    const afterSnooze = await dev.worker.evaluate(async () => ({
      notifications: Object.keys(await chrome.notifications.getAll()),
      badge: await chrome.action.getBadgeText({}),
      remind: await chrome.alarms.get("swarm.update.remind"),
    }));
    check("snooze cleared the notification and the badge", afterSnooze.notifications.length === 0 && afterSnooze.badge === "", JSON.stringify(afterSnooze.notifications));
    check("a reminder alarm is set for the snooze's end", afterSnooze.remind && Math.abs(afterSnooze.remind.scheduledTime - Date.parse(state.snooze.until)) < 2000);
    await shot(page, "snoozed", true);

    // 6. a validly signed, older feed
    routes.set(CUSTOM_PATH, rollback.body);
    await sleep(MANUAL_GAP_MS);
    await page.click("#check");
    state = await until("the rollback verdict", async () => {
      const s = await storage(dev.worker);
      return s.lastCheck && s.lastCheck.code === "rollback" ? s : null;
    }, 30000);
    check("older signed feed refused as rollback", state.lastCheck.code === "rollback");
    check("the accepted offer still stands after the rollback attempt", state.accepted.build.chromium === "153.0.8010.99" && (await page.isVisible("#offer")));

    // 7. nothing downloaded
    check("no download event in the browser", dev.downloadEvents.length === 0, dev.downloadEvents.join(", "));
    check("download folder empty", readdirSync(devDownloads).length === 0);
  } finally {
    await dev.context.close();
  }

  const devRequests = requests.filter((r) => r.phase === "dev");
  check("the server saw requests from the dev copy", devRequests.length >= 4, `${devRequests.length} requests`);
  check("dev copy asked only the custom feed address", devRequests.every((r) => r.method === "GET" && r.url === CUSTOM_PATH), devRequests.map((r) => r.url).join(" "));
  check("no request for an installer or a zip", !requests.some((r) => /\.(exe|zip)$/i.test(r.url)));
  check("no query string, no cookie, no referrer", devRequests.every((r) => !r.url.includes("?") && !r.headers.cookie && !r.headers.referer));
  check("no language list sent (Accept-Language: *)", devRequests.every((r) => r.headers["accept-language"] === "*"), devRequests[0].headers["accept-language"]);
  report.devRequestHeaders = devRequests[0].headers;

  /* Phase 2: a release copy stamped like the build does it. */
  phase = "release";
  const releaseExtension = path.join(WORK, "ext-release");
  cpSync(EXTENSION_DIR, releaseExtension, { recursive: true });
  const stamp = spawnSync("python", [
    "-B", // no __pycache__ left in the repository
    "-c",
    "import sys; sys.path.insert(0, sys.argv[1]); import install_swarm_assets as a; a.stamp_update_version(sys.argv[2])",
    path.join(REPO_ROOT, "swarm"),
    releaseExtension,
  ], { encoding: "utf8" });
  if (stamp.status !== 0) throw new Error(`stamping failed: ${stamp.stderr}`);
  const stamped = JSON.parse(readFileSync(path.join(releaseExtension, "version.json"), "utf8"));
  check("release copy stamped by install_swarm_assets.py", stamped.channel === "release", JSON.stringify(stamped));
  const latest = feed("latest", { chromium: stamped.chromium, swarm: stamped.swarm, published: isoSeconds(Date.now() - 30000) });
  routes.clear();
  routes.set(DEFAULT_PATH, latest.body);
  routes.set(CUSTOM_PATH, offer.body);
  const releaseDownloads = path.join(WORK, "downloads-release");
  mkdirSync(releaseDownloads);
  const release = await launch(chromium, releaseExtension, "profile-release", port, tls.spki, releaseDownloads);
  try {
    await release.worker.evaluate((url) => chrome.storage.local.set({ feedUrl: url }), CUSTOM_URL);
    const popup = await release.context.newPage();
    await popup.setViewportSize({ width: 380, height: 600 });
    await popup.goto(`chrome-extension://${release.id}/popup.html`);
    await popup.waitForSelector("#headline:has-text('Not checked yet')");
    await popup.click("#check");
    await popup.waitForSelector("#headline:has-text('You are on the latest version')", { timeout: 30000 });
    const checked = await popup.textContent("#checked");
    check("release popup: latest version, with the check time", /^Checked /.test(checked), checked);
    check("release popup: shows the stamped build", (await popup.textContent("#running")) === `${stamped.chromium} · SWARM ${stamped.swarm}`);
    await shot(popup, "popup-latest");
    check("release copy: no download", release.downloadEvents.length === 0 && readdirSync(releaseDownloads).length === 0);
  } finally {
    await release.context.close();
  }
  const releaseRequests = requests.filter((r) => r.phase === "release");
  check("release copy ignored the stored custom address", releaseRequests.length >= 1 && releaseRequests.every((r) => r.url === DEFAULT_PATH), releaseRequests.map((r) => r.url).join(" "));

  server.close();
  report.requests = requests.map((r) => ({ phase: r.phase, method: r.method, url: r.url }));
}

main()
  .then(() => {
    report.result = "PASS";
  })
  .catch((error) => {
    report.result = "FAIL";
    report.error = String(error && error.stack ? error.stack : error);
    process.stderr.write(`${report.error}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    report.finished = new Date().toISOString();
    try {
      mkdirSync(SMOKE_DIR, { recursive: true });
      writeFileSync(path.join(SMOKE_DIR, `${PREFIX}-smoke.json`), `${JSON.stringify(report, null, 2)}\n`);
    } catch (_) {
      /* report is best effort */
    }
    rmSync(WORK, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    process.stdout.write(`${report.result}: ${report.checks.filter((c) => c.ok).length}/${report.checks.length} checks; report ${path.join(SMOKE_DIR, `${PREFIX}-smoke.json`)}\n`);
    // The HTTPS server or a stray handle must not keep the process alive.
    setTimeout(() => process.exit(process.exitCode || 0), 200).unref();
  });
