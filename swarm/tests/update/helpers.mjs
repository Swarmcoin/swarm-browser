/**
 * Shared by the SWARM Update test suites.
 *
 * Importing this file cuts the network off for the whole test process: fetch
 * and the Node socket entry points throw. The unit tests hand the code under
 * test a fake fetch instead, so a test that reached for the real network would
 * fail loudly rather than quietly ask swarm.green. The CLI tests start their
 * child processes with `--import` of this same file (NO_NETWORK_IMPORT).
 */

import { generateKeyPairSync, sign } from "node:crypto";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/* ── no network ─────────────────────────────────────────────────────────── */

function refuse(name) {
  return () => {
    throw new Error(`${name}: the SWARM Update unit tests must not use the network`);
  };
}

globalThis.fetch = refuse("fetch");
for (const [module, names] of [
  [net, ["connect", "createConnection"]],
  [tls, ["connect"]],
  [http, ["request", "get"]],
  [https, ["request", "get"]],
  [dns, ["lookup", "resolve", "resolve4", "resolve6"]],
]) {
  for (const name of names) module[name] = refuse(`${module === dns ? "dns" : "net"}.${name}`);
}

/* Keep the one ExperimentalWarning about WebCrypto Ed25519 out of the output. */
const emitWarning = process.emitWarning;
process.emitWarning = function quiet(warning, ...rest) {
  const message = typeof warning === "string" ? warning : warning && warning.message;
  if (/Ed25519/.test(String(message))) return undefined;
  return emitWarning.call(process, warning, ...rest);
};

/* ── places ─────────────────────────────────────────────────────────────── */

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
export const EXTENSION_DIR = path.join(REPO_ROOT, "swarm", "extensions", "update");
export const UPDATES_DIR = path.join(REPO_ROOT, "swarm", "updates");
export const NO_NETWORK_IMPORT = pathToFileURL(path.join(HERE, "helpers.mjs")).href;

/* ── keys and feeds ─────────────────────────────────────────────────────── */

/** A fresh Ed25519 key pair for one test: never the dev key, never on disk. */
export function testKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
  return { publicKey: raw.toString("base64"), privateKey, publicKeyObject: publicKey };
}

export const HEX_A = "0123456789abcdef".repeat(4);
export const HEX_B = "fedcba9876543210".repeat(4);

export function sampleTarget(chromium = "153.0.8010.60", swarm = "2") {
  const tag = `browser-${chromium}-${swarm}`;
  const base = `https://github.com/Swarm-Official/swarm-releases/releases/download/${tag}`;
  return {
    chromium,
    swarm,
    installer: { url: `${base}/SWARM-Browser-${chromium}-${swarm}-win-x64.exe`, sha256: HEX_A, size: 157286400 },
    portable: { url: `${base}/SWARM-Browser-${chromium}-${swarm}-win-x64.zip`, sha256: HEX_B, size: 167772160 },
    notes: `https://github.com/Swarm-Official/swarm-releases/releases/tag/${tag}`,
  };
}

export function samplePayload({ published = "2026-09-27T18:00:00Z", targets } = {}) {
  return { product: "swarm-browser", published, targets: targets || { "windows-x64": sampleTarget() } };
}

export function bytesOf(value) {
  return new TextEncoder().encode(typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}

export function b64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

export function signBytes(key, bytes) {
  return new Uint8Array(sign(null, bytes, key.privateKey));
}

/** A complete envelope, as a string, signed by `key` over the payload bytes. */
export function envelopeFor(key, payload, { format = 1, signature } = {}) {
  const bytes = payload instanceof Uint8Array ? payload : bytesOf(payload);
  const sig = signature === undefined ? b64(signBytes(key, bytes)) : signature;
  const envelope = { format, payload: b64(bytes) };
  if (sig !== null) envelope.signature = sig;
  return JSON.stringify(envelope);
}

export const RUNNING_DEV = Object.freeze({ chromium: "0.0.0.0", swarm: "0", channel: "dev" });
export const RUNNING_RELEASE = Object.freeze({ chromium: "153.0.8010.52", swarm: "1", channel: "release" });

/* ── a fake fetch ───────────────────────────────────────────────────────── */

export const FEED = "https://swarm.green/browser/updates.json";

/** A Response-like object whose `url` can be set, which a real Response's cannot. */
export function fakeResponse(body, { status = 200, url = FEED, headers = {} } = {}) {
  const real = new Response(status === 204 || status === 304 ? null : body, { status, headers });
  return {
    status: real.status,
    ok: real.ok,
    url,
    headers: real.headers,
    body: real.body,
    arrayBuffer: () => real.arrayBuffer(),
  };
}

/** A fetch that records every call and answers with `respond(url, init, n)`. */
export function recordingFetch(respond) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init, calls.length);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}
