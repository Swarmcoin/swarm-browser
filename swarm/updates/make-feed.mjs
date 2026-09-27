#!/usr/bin/env node
/**
 * Writes the PAYLOAD of an update feed: the JSON that sign-feed.mjs signs.
 *
 * One target from arguments:
 *
 *   node swarm/updates/make-feed.mjs --out payload.json \
 *     --chromium 153.0.8010.60 --swarm 2 \
 *     --installer-url https://github.com/Swarm-Official/swarm-releases/releases/download/<tag>/SWARM-Browser-153.0.8010.60-2-win-x64.exe \
 *     --installer-file D:/dist/SWARM-Browser-153.0.8010.60-2-win-x64.exe \
 *     --portable-url  https://github.com/Swarm-Official/swarm-releases/releases/download/<tag>/SWARM-Browser-153.0.8010.60-2-win-x64.zip \
 *     --portable-file D:/dist/SWARM-Browser-153.0.8010.60-2-win-x64.zip \
 *     --notes https://github.com/Swarm-Official/swarm-releases/releases/tag/<tag>
 *
 *   (--installer-sha256 <hex> --installer-size <bytes> instead of --installer-file,
 *    and the same for --portable-*; --target defaults to windows-x64;
 *    --published defaults to now, UTC, whole seconds.)
 *
 * Or every target from a small JSON file:
 *
 *   node swarm/updates/make-feed.mjs --input release.json --out payload.json
 *
 *   {"published": "2026-09-27T18:00:00Z",          (optional)
 *    "targets": {"windows-x64": {"chromium": "...", "swarm": "2",
 *      "installer": {"url": "...", "file": "SWARM-...exe"},   (or sha256 + size)
 *      "portable":  {"url": "...", "sha256": "...", "size": 123},
 *      "notes": "https://..."}}}
 *
 * A "file" in the JSON is read relative to the JSON file. The result is
 * checked with the extension's own rules (lib/feed.js parsePayload) before it
 * is written, so a payload this tool writes is one the browser will accept
 * once signed. A published time more than ten minutes ahead of this clock is
 * refused unless --allow-future: a feed from the future would stop browsers
 * from accepting any honest feed published before that time.
 */

import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { PRODUCT, parsePayload, parsePublished } from "../extensions/update/lib/feed.js";
import { fail, isoSeconds, sha256File } from "./common.mjs";

const FUTURE_SLACK_MS = 10 * 60 * 1000;
const USAGE = "see the comment at the top of swarm/updates/make-feed.mjs";

async function artifact(spec, base, label) {
  if (!spec || typeof spec !== "object") fail(`${label}: missing`, 2);
  const out = { url: spec.url, sha256: spec.sha256, size: spec.size };
  if (spec.file) {
    const file = path.resolve(base, spec.file);
    let stat;
    try {
      stat = statSync(file);
    } catch (_) {
      fail(`${label}: cannot read ${file}`);
    }
    const sha256 = await sha256File(file);
    if (out.sha256 && out.sha256.toLowerCase() !== sha256) fail(`${label}: sha256 given does not match ${file}`);
    if (out.size !== undefined && Number(out.size) !== stat.size) fail(`${label}: size given does not match ${file}`);
    out.sha256 = sha256;
    out.size = stat.size;
  }
  if (typeof out.sha256 === "string") out.sha256 = out.sha256.toLowerCase();
  if (typeof out.size === "string" && /^\d+$/.test(out.size)) out.size = Number(out.size);
  return out;
}

async function targetFrom(spec, base, name) {
  return {
    chromium: spec.chromium,
    swarm: typeof spec.swarm === "number" ? String(spec.swarm) : spec.swarm,
    installer: await artifact(spec.installer, base, `${name} installer`),
    portable: await artifact(spec.portable, base, `${name} portable`),
    notes: spec.notes,
  };
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        input: { type: "string" },
        out: { type: "string" },
        published: { type: "string" },
        "allow-future": { type: "boolean", default: false },
        target: { type: "string", default: "windows-x64" },
        chromium: { type: "string" },
        swarm: { type: "string" },
        "installer-url": { type: "string" },
        "installer-file": { type: "string" },
        "installer-sha256": { type: "string" },
        "installer-size": { type: "string" },
        "portable-url": { type: "string" },
        "portable-file": { type: "string" },
        "portable-sha256": { type: "string" },
        "portable-size": { type: "string" },
        notes: { type: "string" },
        help: { type: "boolean", default: false },
      },
      strict: true,
    }));
  } catch (error) {
    fail(`${error.message}\n${USAGE}`, 2);
  }
  if (values.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  let published = values.published;
  const targets = {};
  if (values.input) {
    if (values.chromium || values.swarm || values["installer-url"] || values["portable-url"]) {
      fail("give --input or the one-target arguments, not both", 2);
    }
    const file = path.resolve(values.input);
    let spec;
    try {
      spec = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      fail(`cannot read ${file}: ${error.message}`, 2);
    }
    if (!published && typeof spec.published === "string") published = spec.published;
    if (!spec.targets || typeof spec.targets !== "object") fail(`${file}: no "targets"`, 2);
    for (const [name, target] of Object.entries(spec.targets)) {
      targets[name] = await targetFrom(target, path.dirname(file), name);
    }
  } else {
    targets[values.target] = await targetFrom(
      {
        chromium: values.chromium,
        swarm: values.swarm,
        installer: {
          url: values["installer-url"],
          file: values["installer-file"],
          sha256: values["installer-sha256"],
          size: values["installer-size"],
        },
        portable: {
          url: values["portable-url"],
          file: values["portable-file"],
          sha256: values["portable-sha256"],
          size: values["portable-size"],
        },
        notes: values.notes,
      },
      process.cwd(),
      values.target,
    );
  }

  published = published || isoSeconds();
  const publishedMs = parsePublished(published);
  if (publishedMs === null) fail(`published "${published}" must look like 2026-09-27T18:00:00Z`, 2);
  if (publishedMs > Date.now() + FUTURE_SLACK_MS && !values["allow-future"]) {
    fail(
      `published ${published} is in the future. A feed from the future would make browsers refuse every honest feed ` +
        "published before that time. Fix the clock or the date, or pass --allow-future if you really mean it.",
    );
  }

  const payload = { product: PRODUCT, published, targets };
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  const checked = parsePayload(new TextEncoder().encode(text));
  if (!checked.ok) fail(`not a valid payload: ${checked.detail || checked.message}`);

  if (values.out) {
    writeFileSync(path.resolve(values.out), text, "utf8");
    const names = Object.entries(targets).map(([name, t]) => `${name} ${t.chromium} SWARM ${t.swarm}`);
    process.stderr.write(`payload: ${path.resolve(values.out)}  (published ${published}; ${names.join("; ")})\n`);
  } else {
    process.stdout.write(text);
  }
}

main().catch((error) => fail(error && error.stack ? error.stack : String(error)));
