/**
 * The four tools in swarm/updates, run as the owner would run them, with a
 * throwaway key in a temporary folder. Every child process is started with
 * `--import helpers.mjs`, so the tools cannot reach the network either.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, createPrivateKey } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { NO_NETWORK_IMPORT, REPO_ROOT, UPDATES_DIR, b64 } from "./helpers.mjs";

const WORK = mkdtempSync(path.join(os.tmpdir(), "swarm-update-tools-"));
test.after(() => rmSync(WORK, { recursive: true, force: true }));

function tool(name, args) {
  const result = spawnSync(process.execPath, ["--import", NO_NETWORK_IMPORT, path.join(UPDATES_DIR, name), ...args], {
    encoding: "utf8",
    cwd: WORK,
  });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

const KEY_FILE = path.join(WORK, "keys", "feed-test.pem");
const KEY_JS = path.join(WORK, "feed-key.js");
let publicKey = null;

test("gen-key writes the private key where it is told, prints only the public key", () => {
  const run = tool("gen-key.mjs", ["--out", KEY_FILE, "--label", "test-1", "--write-extension-key", "--extension-key-file", KEY_JS]);
  assert.equal(run.status, 0, run.err);
  assert.doesNotMatch(run.out + run.err, /PRIVATE KEY/);
  const pem = readFileSync(KEY_FILE, "utf8");
  assert.match(pem, /^-----BEGIN PRIVATE KEY-----/);
  assert.equal(createPrivateKey(pem).asymmetricKeyType, "ed25519");
  publicKey = /public key:\s+(\S+)/.exec(run.out)[1];
  assert.equal(Buffer.from(publicKey, "base64").length, 32);
  // The feed-key.js it wrote trusts exactly that key.
  const written = readFileSync(KEY_JS, "utf8");
  assert.match(written, new RegExp(`label: "test-1", publicKey: "${publicKey.replace(/[+/=]/g, "\\$&")}"`));
  assert.doesNotMatch(written, /PRIVATE/);
});

test("gen-key refuses a path inside a git repository and never overwrites a key", () => {
  const inside = path.join(REPO_ROOT, "swarm", "updates", "must-not-exist.pem");
  const run = tool("gen-key.mjs", ["--out", inside]);
  assert.notEqual(run.status, 0);
  assert.match(run.err, /inside the git repository/);
  assert.equal(existsSync(inside), false);

  const before = readFileSync(KEY_FILE, "utf8");
  const again = tool("gen-key.mjs", ["--out", KEY_FILE]);
  assert.notEqual(again.status, 0);
  assert.match(again.err, /refusing to overwrite/);
  assert.equal(readFileSync(KEY_FILE, "utf8"), before);
});

test("gen-key --add-extension-key keeps the keys already trusted", () => {
  const backup = path.join(WORK, "keys", "feed-backup.pem");
  const run = tool("gen-key.mjs", ["--out", backup, "--label", "test-backup", "--add-extension-key", "--extension-key-file", KEY_JS]);
  assert.equal(run.status, 0, run.err);
  const written = readFileSync(KEY_JS, "utf8");
  assert.match(written, /label: "test-1"/);
  assert.match(written, /label: "test-backup"/);
});

const INSTALLER = path.join(WORK, "SWARM-Browser-153.0.8010.60-2-win-x64.exe");
const PORTABLE = path.join(WORK, "SWARM-Browser-153.0.8010.60-2-win-x64.zip");
const BASE = "https://github.com/Swarm-Official/swarm-releases/releases/download/browser-153.0.8010.60-2";
const PAYLOAD = path.join(WORK, "payload.json");
const FEED_FILE = path.join(WORK, "updates.json");

test("make-feed hashes the release files and writes a payload the extension accepts", () => {
  writeFileSync(INSTALLER, "pretend installer\n");
  writeFileSync(PORTABLE, "pretend portable zip\n");
  const run = tool("make-feed.mjs", [
    "--out", PAYLOAD,
    "--published", "2026-09-27T18:00:00Z",
    "--chromium", "153.0.8010.60",
    "--swarm", "2",
    "--installer-url", `${BASE}/SWARM-Browser-153.0.8010.60-2-win-x64.exe`,
    "--installer-file", INSTALLER,
    "--portable-url", `${BASE}/SWARM-Browser-153.0.8010.60-2-win-x64.zip`,
    "--portable-file", PORTABLE,
    "--notes", "https://github.com/Swarm-Official/swarm-releases/releases/tag/browser-153.0.8010.60-2",
  ]);
  assert.equal(run.status, 0, run.err);
  const payload = JSON.parse(readFileSync(PAYLOAD, "utf8"));
  assert.equal(payload.product, "swarm-browser");
  const target = payload.targets["windows-x64"];
  assert.equal(target.installer.size, "pretend installer\n".length);
  assert.equal(target.installer.sha256, createHash("sha256").update("pretend installer\n").digest("hex"));
  assert.equal(target.portable.size, "pretend portable zip\n".length);
  assert.equal(target.portable.sha256, createHash("sha256").update("pretend portable zip\n").digest("hex"));
});

test("make-feed refuses what the browser would refuse, and a date from the future", () => {
  const common = ["--chromium", "153.0.8010.60", "--swarm", "2",
    "--installer-sha256", "a".repeat(64), "--installer-size", "10",
    "--portable-url", `${BASE}/x.zip`, "--portable-sha256", "b".repeat(64), "--portable-size", "10",
    "--notes", "https://swarm.green/browser/notes"];
  const http = tool("make-feed.mjs", [...common, "--installer-url", "http://github.com/Swarm-Official/x.exe"]);
  assert.notEqual(http.status, 0);
  assert.match(http.err, /installer/);
  const elsewhere = tool("make-feed.mjs", [...common, "--installer-url", "https://example.com/x.exe"]);
  assert.notEqual(elsewhere.status, 0);
  const future = tool("make-feed.mjs", [...common, "--installer-url", `${BASE}/x.exe`, "--published", "2099-01-01T00:00:00Z"]);
  assert.notEqual(future.status, 0);
  assert.match(future.err, /future/);
  const allowed = tool("make-feed.mjs", [...common, "--installer-url", `${BASE}/x.exe`, "--published", "2099-01-01T00:00:00Z", "--allow-future"]);
  assert.equal(allowed.status, 0, allowed.err);
});

test("make-feed --input reads every target from a small JSON file", () => {
  const spec = path.join(WORK, "release.json");
  writeFileSync(spec, JSON.stringify({
    published: "2026-09-27T18:30:00Z",
    targets: {
      "windows-x64": {
        chromium: "153.0.8010.60",
        swarm: 2,
        installer: { url: `${BASE}/SWARM-Browser-153.0.8010.60-2-win-x64.exe`, file: path.basename(INSTALLER) },
        portable: { url: `${BASE}/SWARM-Browser-153.0.8010.60-2-win-x64.zip`, file: path.basename(PORTABLE) },
        notes: "https://github.com/Swarm-Official/swarm-releases/releases/tag/browser-153.0.8010.60-2",
      },
    },
  }));
  const out = path.join(WORK, "payload-input.json");
  const run = tool("make-feed.mjs", ["--input", spec, "--out", out]);
  assert.equal(run.status, 0, run.err);
  const payload = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(payload.published, "2026-09-27T18:30:00Z");
  assert.equal(payload.targets["windows-x64"].swarm, "2");
  const direct = JSON.parse(readFileSync(PAYLOAD, "utf8"));
  assert.deepEqual(payload.targets, direct.targets);
});

test("sign-feed writes the envelope; verify-feed accepts it with the matching key", () => {
  const sign = tool("sign-feed.mjs", ["--key", KEY_FILE, "--payload", PAYLOAD, "--out", FEED_FILE]);
  assert.equal(sign.status, 0, sign.err);
  assert.match(sign.err, /not in swarm\/extensions\/update\/lib\/feed-key\.js/);
  const envelope = JSON.parse(readFileSync(FEED_FILE, "utf8"));
  assert.deepEqual(Object.keys(envelope), ["format", "payload", "signature"]);
  assert.equal(envelope.format, 1);
  assert.deepEqual(Buffer.from(envelope.payload, "base64"), readFileSync(PAYLOAD));

  const verify = tool("verify-feed.mjs", [FEED_FILE, "--public-key", publicKey, "--running", "153.0.8010.52+1"]);
  assert.equal(verify.status, 0, verify.out + verify.err);
  assert.match(verify.out, /ACCEPTED/);
  assert.match(verify.out, /153\.0\.8010\.60 SWARM 2 -> offer/);
});

test("verify-feed refuses the same feed against the key baked into the extension", () => {
  const verify = tool("verify-feed.mjs", [FEED_FILE]);
  assert.equal(verify.status, 1);
  assert.match(verify.out, /REFUSED\s+bad_signature/);
});

test("verify-feed refuses a tampered feed, a downgrade and a rollback", () => {
  const envelope = JSON.parse(readFileSync(FEED_FILE, "utf8"));
  const bytes = Buffer.from(envelope.payload, "base64");
  const text = bytes.toString("utf8").replace('"swarm": "2"', '"swarm": "3"');
  assert.notEqual(text, bytes.toString("utf8"));
  const tampered = path.join(WORK, "tampered.json");
  writeFileSync(tampered, JSON.stringify({ ...envelope, payload: b64(Buffer.from(text, "utf8")) }));
  const bad = tool("verify-feed.mjs", [tampered, "--public-key", publicKey]);
  assert.equal(bad.status, 1);
  assert.match(bad.out, /bad_signature/);

  const unsigned = path.join(WORK, "unsigned.json");
  writeFileSync(unsigned, JSON.stringify({ format: 1, payload: envelope.payload }));
  assert.match(tool("verify-feed.mjs", [unsigned, "--public-key", publicKey]).out, /REFUSED\s+unsigned/);

  const older = tool("verify-feed.mjs", [FEED_FILE, "--public-key", publicKey, "--running", "153.0.8010.61+1"]);
  assert.equal(older.status, 1);
  assert.match(older.out, /REFUSED\s+older/);

  const rollback = tool("verify-feed.mjs", [FEED_FILE, "--public-key", publicKey, "--last-published", "2026-09-28T00:00:00Z"]);
  assert.equal(rollback.status, 1);
  assert.match(rollback.out, /REFUSED\s+rollback/);
});

test("verify-feed --json gives the decision in a form a script can read", () => {
  const run = tool("verify-feed.mjs", [FEED_FILE, "--public-key", publicKey, "--running", "153.0.8010.60+2", "--json"]);
  assert.equal(run.status, 0, run.err);
  const result = JSON.parse(run.out);
  assert.equal(result.ok, true);
  assert.equal(result.status, "latest");
  assert.equal(result.published, "2026-09-27T18:00:00Z");
});

test("sign-feed refuses an invalid payload and a key kept inside a repository", () => {
  const invalid = path.join(WORK, "invalid.json");
  writeFileSync(invalid, JSON.stringify({ product: "swarm-browser", published: "2026-09-27T18:00:00Z", targets: {} }));
  const run = tool("sign-feed.mjs", ["--key", KEY_FILE, "--payload", invalid, "--out", path.join(WORK, "never.json")]);
  assert.notEqual(run.status, 0);
  assert.match(run.err, /refusing to sign an invalid payload/);
  assert.equal(existsSync(path.join(WORK, "never.json")), false);

  const inRepo = path.join(REPO_ROOT, "swarm", "updates", "no-such-key.pem");
  const inside = tool("sign-feed.mjs", ["--key", inRepo, "--payload", PAYLOAD, "--out", path.join(WORK, "never.json")]);
  assert.notEqual(inside.status, 0);
  assert.match(inside.err, /inside the git repository/);
});

test("verify-feed cannot reach the network from the tests either", () => {
  const run = tool("verify-feed.mjs", ["https://swarm.green/browser/updates.json"]);
  assert.equal(run.status, 1);
  assert.match(run.out, /REFUSED\s+network/);
});
