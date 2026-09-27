#!/usr/bin/env node
/**
 * Runs the browser's own check on a feed, outside the browser.
 *
 *   node swarm/updates/verify-feed.mjs updates.json
 *   node swarm/updates/verify-feed.mjs https://swarm.green/browser/updates.json
 *
 *   --public-key <base64>         trust this key instead of the extension's (repeatable)
 *   --running <chromium>+<swarm>  compare with this build, e.g. 153.0.8010.52+1
 *                                 (default 0.0.0.0+0: every listed build is newer)
 *   --last-published <time>       the rollback floor a browser would already hold
 *   --target <name>               default windows-x64
 *   --json                        print the result as JSON
 *
 * It calls checkFeed() from swarm/extensions/update/lib/feed.js, the function
 * the service worker calls, with WebCrypto's Ed25519. Given an address it
 * fetches it exactly as the browser does (lib/check.js fetchFeed: no cookies,
 * no cache, no query, and only from https://swarm.green) - the one time these
 * tools touch the network, and only when asked to.
 *
 * Exit status: 0 when the feed would be accepted, 1 when it would be refused,
 * 2 when the command itself is wrong.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { webcrypto } from "node:crypto";

import { fetchFeed } from "../extensions/update/lib/check.js";
import { checkFeed, parseEnvelope, parsePayload } from "../extensions/update/lib/feed.js";
import { bakedFeedKeys, fail, quietEd25519Warning } from "./common.mjs";

quietEd25519Warning();

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        "public-key": { type: "string", multiple: true },
        running: { type: "string", default: "0.0.0.0+0" },
        "last-published": { type: "string" },
        target: { type: "string", default: "windows-x64" },
        json: { type: "boolean", default: false },
      },
      strict: true,
    });
  } catch (error) {
    fail(`${error.message}\nnode swarm/updates/verify-feed.mjs <updates.json | https://swarm.green/...> [options]`, 2);
  }
  const { values, positionals } = parsed;
  if (positionals.length !== 1) fail("give exactly one feed: a file or an https://swarm.green address", 2);
  const source = positionals[0];

  const [chromium, swarm] = values.running.split("+");
  const running = { chromium, swarm, channel: "release" };

  const keys = values["public-key"] && values["public-key"].length
    ? values["public-key"].map((publicKey, index) => ({ label: `--public-key ${index + 1}`, publicKey }))
    : await bakedFeedKeys();

  let body;
  if (/^https?:\/\//i.test(source)) {
    const fetched = await fetchFeed((url, init) => fetch(url, init), source);
    if (!fetched.ok) {
      report(values.json, { ok: false, code: fetched.code, message: fetched.message, detail: fetched.detail });
      process.exit(1);
    }
    body = fetched.bytes;
  } else {
    try {
      body = new Uint8Array(readFileSync(path.resolve(source)));
    } catch (error) {
      fail(`cannot read ${source}: ${error.message}`, 2);
    }
  }

  const result = await checkFeed({
    body,
    publicKeys: keys.map((key) => key.publicKey),
    subtle: webcrypto.subtle,
    running,
    target: values.target,
    lastPublished: values["last-published"] || null,
  });
  if (result.ok) {
    result.key = keys[result.keyIndex].label;
    const envelope = parseEnvelope(body);
    result.payload = parsePayload(envelope.payloadBytes).payload;
  }
  report(values.json, result);
  process.exit(result.ok ? 0 : 1);
}

function report(json, result) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (!result.ok) {
    process.stdout.write(`REFUSED  ${result.code}: ${result.message}${result.detail ? ` (${result.detail})` : ""}\n`);
    return;
  }
  process.stdout.write(`ACCEPTED signed by ${result.key}; published ${result.published}\n`);
  if (!result.build) {
    process.stdout.write(`         no entry for ${result.target}\n`);
    return;
  }
  const build = result.build;
  process.stdout.write(`         ${result.target}: ${build.chromium} SWARM ${build.swarm} -> ${result.status}\n`);
  process.stdout.write(`         installer ${build.installer.url}\n                   sha256 ${build.installer.sha256}, ${build.installer.size} bytes\n`);
  process.stdout.write(`         portable  ${build.portable.url}\n                   sha256 ${build.portable.sha256}, ${build.portable.size} bytes\n`);
  process.stdout.write(`         notes     ${build.notes}\n`);
}

main().catch((error) => fail(error && error.stack ? error.stack : String(error)));
