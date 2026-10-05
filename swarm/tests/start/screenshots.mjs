/**
 * Screenshots of the SWM price on SWARM Start: the tile on the new-tab page
 * and the price page, in each state of harness-stub.js.
 *
 *   node swarm/tests/start/screenshots.mjs [--live] [path\to\msedge.exe]
 *
 * Serves swarm/ on 127.0.0.1 (a random port, this process only) and opens the
 * REAL newtab.html and price.html from swarm/extensions/start in a headless
 * Edge with a throwaway profile; the only change on the way out is one
 * <script> tag for harness-stub.js in front of the page's own module, which
 * fakes chrome.* and the price relay. Writes swarm/tests/start/screenshots/
 * <state>.png. Nothing is installed and nothing leaves the machine, except
 * with --live: two more shots read the real relay
 * (https://wallet.swarm.green/api/price/swm, one GET each, read-only).
 *
 * Not part of `node --test` (the file name does not end in .test.mjs).
 */
import http from "node:http";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", ".."); // swarm/
const out = path.join(here, "screenshots");
const args = process.argv.slice(2);
const live = args.includes("--live");
const edge = args.find((a) => !a.startsWith("--")) || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

// [state, page, width, height]
const SHOTS = [
  ["fresh", "newtab", 1280, 1000],
  ["down", "newtab", 1280, 1000],
  ["ageing", "newtab", 1280, 1000],
  ["stale", "newtab", 1280, 1000],
  ["unavailable", "newtab", 1280, 1000],
  ["note", "newtab", 1280, 1000],
  ["settings", "newtab", 1280, 1000],
  ["off", "newtab", 1280, 1000],
  ["fresh-narrow", "newtab", 560, 1900],
  ["page", "price", 1000, 1150],
  ["page-30d", "price", 1000, 1150],
  ["page-hover", "price", 1000, 1150],
  ["page-off", "price", 1000, 560],
  ["page-narrow", "price", 560, 1800],
  ...(live
    ? [
        ["live", "newtab", 1280, 1000],
        ["page-live", "price", 1000, 1150],
      ]
    : []),
];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const STUB = '<script src="/tests/start/harness-stub.js"></script>\n    ';

const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    let body = await readFile(file);
    if (/extensions[\\/]start[\\/](newtab|price)\.html$/.test(file)) {
      const html = body.toString("utf8");
      const at = html.indexOf('<script type="module"');
      if (at < 0) throw new Error("no module script");
      body = Buffer.from(html.slice(0, at) + STUB + html.slice(at), "utf8");
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(body);
  } catch (_) {
    res.writeHead(404).end();
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await mkdir(out, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), "swarm-start-harness-"));

function shoot(state, page, width, height) {
  const file = path.join(out, `${state}.png`);
  const harnessState = state.replace(/-narrow$/, "").replace(/^page$/, "page");
  const url = `http://127.0.0.1:${port}/extensions/start/${page}.html?state=${harnessState === "page" ? "fresh" : harnessState}`;
  const argv = [
    "--headless=new",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--disable-extensions",
    "--disable-sync",
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--force-device-scale-factor=1",
    `--window-size=${width},${height}`,
    "--virtual-time-budget=5000",
    `--screenshot=${file}`,
    url,
  ];
  return new Promise((resolve, reject) => {
    execFile(edge, argv, { timeout: 60_000 }, (err) => (err ? reject(err) : resolve(file)));
  });
}

try {
  for (const [state, page, width, height] of SHOTS) {
    console.log(await shoot(state, page, width, height));
  }
} finally {
  server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
