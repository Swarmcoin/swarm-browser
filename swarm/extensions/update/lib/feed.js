/**
 * The SWARM Browser update feed, and the one function that decides whether to
 * believe it.
 *
 * The feed is one static file, https://swarm.green/browser/updates.json:
 *
 *   {"format":1,"payload":"<base64 of the payload bytes>",
 *    "signature":"<base64 Ed25519 signature over exactly those bytes>"}
 *
 * The payload is JSON, but it is parsed only AFTER its signature has been
 * checked, and the bytes that are checked are the bytes that are parsed: the
 * signature covers the payload as it was written, never a re-serialisation.
 *
 * Everything here is pure: no chrome.*, no fetch, no storage and no clock of
 * its own. The service worker, the node:test suites in swarm/tests/update and
 * swarm/updates/verify-feed.mjs all call checkFeed() the same way, so the
 * check that ships is the check that is tested.
 */

export const FEED_FORMAT = 1;
export const PRODUCT = "swarm-browser";

/** The one address a release build ever asks. */
export const FEED_URL = "https://swarm.green/browser/updates.json";
export const FEED_ORIGIN = "https://swarm.green";

/** A real feed is a few kilobytes; anything near these limits is not one. */
export const MAX_FEED_BYTES = 64 * 1024;
export const MAX_PAYLOAD_BYTES = 32 * 1024;
export const MAX_TARGETS = 16;
export const MAX_DOWNLOAD_BYTES = 4 * 1024 * 1024 * 1024;

export const ED25519_PUBLIC_KEY_BYTES = 32;
export const ED25519_SIGNATURE_BYTES = 64;

/**
 * Where a download or a release-notes link may point. The feed is signed, so
 * these could be anything the key holder writes; the list is a second lock, so
 * that someone holding the feed key but not the SWARM GitHub organisation or
 * the website still cannot send people somewhere else.
 */
export const ALLOWED_LINK_PREFIXES = Object.freeze([
  "https://github.com/Swarm-Official/",
  "https://swarm.green/",
]);

const TARGET_NAME = /^[a-z0-9]+-[a-z0-9]+$/;
const VERSION_PART = "(0|[1-9][0-9]{0,8})";
const CHROMIUM_VERSION = new RegExp(`^${VERSION_PART}\\.${VERSION_PART}\\.${VERSION_PART}\\.${VERSION_PART}$`);
const SWARM_REVISION = new RegExp(`^${VERSION_PART}$`);
const SHA256_HEX = /^[0-9a-f]{64}$/;
const PUBLISHED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/* ── plain-language reasons ─────────────────────────────────────────────── */

export const MESSAGES = Object.freeze({
  not_published: "SWARM has not published an update list yet.",
  network: "swarm.green could not be reached.",
  timeout: "swarm.green did not answer in time.",
  http: "swarm.green answered with an error.",
  wrong_origin: "The answer came from somewhere other than swarm.green, so it was ignored.",
  too_large: "The update list was larger than a real one can be, so it was not read.",
  bad_envelope: "The update list is not in a form this browser understands, so it was ignored.",
  bad_format: "The update list is in a format this browser does not know, so it was ignored.",
  unsigned: "The update list carried no signature, so it was ignored.",
  bad_signature: "The update list failed its signature check, so it was ignored.",
  no_key: "This browser has no key to check the update list with.",
  no_ed25519: "This browser cannot check Ed25519 signatures, so it cannot trust any update list.",
  bad_payload: "The update list was signed, but what it says is not valid, so it was ignored.",
  wrong_product: "The update list is for another product, so it was ignored.",
  rollback: "This update list is older than one already seen, so it was ignored.",
  older: "The update list offers an older version than the one you have, so it was ignored.",
  bad_version: "This browser does not know its own version, so it cannot compare.",
  bad_custom_url: "The custom update address is not a plain https://swarm.green address, so nothing was asked.",
});

/** A refusal: always `ok:false`, a stable code, and a sentence for people. */
export function reject(code, detail = null) {
  return {
    ok: false,
    code,
    message: MESSAGES[code] || "The update check failed.",
    detail: detail === null || detail === undefined ? null : String(detail),
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/* ── base64, strictly ───────────────────────────────────────────────────── */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i += 1) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

/** Standard base64 with padding, the only spelling the feed uses. */
export function encodeBase64(bytes) {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += `${ALPHABET[(n >> 18) & 63]}${ALPHABET[(n >> 12) & 63]}==`;
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += `${ALPHABET[(n >> 18) & 63]}${ALPHABET[(n >> 12) & 63]}${ALPHABET[(n >> 6) & 63]}=`;
  }
  return out;
}

/**
 * Decodes standard, padded base64 and nothing else: no whitespace, no URL
 * alphabet, no missing padding, and only the canonical spelling of the bytes
 * (the one encodeBase64 would write). Returns null for anything else, where
 * atob() would quietly accept several of those.
 */
export function decodeBase64(text) {
  if (typeof text !== "string" || text.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null;
  const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  const length = (text.length / 4) * 3 - padding;
  const out = new Uint8Array(length);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    const a = LOOKUP[text.charCodeAt(i)];
    const b = LOOKUP[text.charCodeAt(i + 1)];
    const c = text[i + 2] === "=" ? 0 : LOOKUP[text.charCodeAt(i + 2)];
    const d = text[i + 3] === "=" ? 0 : LOOKUP[text.charCodeAt(i + 3)];
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < length) out[o++] = (n >> 16) & 255;
    if (o < length) out[o++] = (n >> 8) & 255;
    if (o < length) out[o++] = n & 255;
  }
  return encodeBase64(out) === text ? out : null;
}

function toBytes(body) {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  if (typeof body === "string") return new TextEncoder().encode(body);
  return null;
}

function utf8(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (_) {
    return null;
  }
}

/* ── versions ───────────────────────────────────────────────────────────── */

/** "153.0.8010.52" -> [153, 0, 8010, 52]; anything else -> null. */
export function parseChromiumVersion(value) {
  if (typeof value !== "string" || !CHROMIUM_VERSION.test(value)) return null;
  return value.split(".").map(Number);
}

/** "2" -> 2; the SWARM layer's build number is a plain decimal string. */
export function parseSwarmRevision(value) {
  if (typeof value !== "string" || !SWARM_REVISION.test(value)) return null;
  return Number(value);
}

/**
 * Orders two builds: Chromium version first, part by part as numbers (so
 * 8010.100 is after 8010.99), then the SWARM revision. Returns -1, 0 or 1, or
 * null when either side is not a valid build.
 */
export function compareBuilds(a, b) {
  const av = parseChromiumVersion(a && a.chromium);
  const bv = parseChromiumVersion(b && b.chromium);
  const as = parseSwarmRevision(a && a.swarm);
  const bs = parseSwarmRevision(b && b.swarm);
  if (!av || !bv || as === null || bs === null) return null;
  for (let i = 0; i < 4; i += 1) {
    if (av[i] !== bv[i]) return av[i] < bv[i] ? -1 : 1;
  }
  if (as !== bs) return as < bs ? -1 : 1;
  return 0;
}

/** A stable name for one build, used to remember what was offered. */
export function buildKey(build) {
  return `${build.chromium}+${build.swarm}`;
}

/**
 * The running build, from the extension's own version.json. The committed
 * file is the placeholder {"chromium":"0.0.0.0","swarm":"0","channel":"dev"};
 * swarm/install_swarm_assets.py rewrites it with the real numbers and channel
 * "release" when it copies the extension into the Chromium tree.
 */
export function parseRunning(value) {
  if (!isPlainObject(value)) return reject("bad_version");
  if (!parseChromiumVersion(value.chromium) || parseSwarmRevision(value.swarm) === null) {
    return reject("bad_version");
  }
  if (value.channel !== "dev" && value.channel !== "release") return reject("bad_version");
  return { ok: true, chromium: value.chromium, swarm: value.swarm, channel: value.channel };
}

/** The feed's name for the platform chrome.runtime.getPlatformInfo() reports. */
export function targetFor(os, arch) {
  const system = { win: "windows", mac: "macos", linux: "linux" }[os];
  const cpu = { "x86-64": "x64", "x86-32": "x86", arm64: "arm64", arm: "arm" }[arch];
  return system && cpu ? `${system}-${cpu}` : null;
}

/* ── the payload ────────────────────────────────────────────────────────── */

/** Milliseconds since 1970 for a strict UTC timestamp, or null. */
export function parsePublished(value) {
  if (typeof value !== "string" || !PUBLISHED.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  // Refuse dates JavaScript would roll over (2026-02-30 is not 2 March).
  if (new Date(ms).toISOString().slice(0, 19) !== value.slice(0, 19)) return null;
  return ms;
}

/** An https link under one of ALLOWED_LINK_PREFIXES, written canonically. */
export function parseLink(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return null;
  let url;
  try {
    url = new URL(value);
  } catch (_) {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  // The canonical form must be what was written: no "..", no case games with
  // the host, nothing that means something different once parsed.
  if (url.href !== value) return null;
  if (!ALLOWED_LINK_PREFIXES.some((prefix) => value.startsWith(prefix))) return null;
  return value;
}

function parseArtifact(value) {
  if (!isPlainObject(value)) return { ok: false, detail: "missing" };
  const url = parseLink(value.url);
  if (!url) return { ok: false, detail: "url must be https under github.com/Swarm-Official/ or swarm.green/" };
  if (typeof value.sha256 !== "string" || !SHA256_HEX.test(value.sha256)) {
    return { ok: false, detail: "sha256 must be 64 lowercase hex digits" };
  }
  if (!Number.isSafeInteger(value.size) || value.size <= 0 || value.size > MAX_DOWNLOAD_BYTES) {
    return { ok: false, detail: "size must be a whole number of bytes" };
  }
  return { ok: true, artifact: { url, sha256: value.sha256, size: value.size } };
}

/** One platform's entry: the build it offers and where to get it. */
export function parseTarget(value) {
  if (!isPlainObject(value)) return { ok: false, detail: "not an object" };
  if (!parseChromiumVersion(value.chromium)) return { ok: false, detail: "chromium must look like 153.0.8010.52" };
  if (parseSwarmRevision(value.swarm) === null) return { ok: false, detail: 'swarm must be a revision string like "2"' };
  const installer = parseArtifact(value.installer);
  if (!installer.ok) return { ok: false, detail: `installer: ${installer.detail}` };
  const portable = parseArtifact(value.portable);
  if (!portable.ok) return { ok: false, detail: `portable: ${portable.detail}` };
  const notes = parseLink(value.notes);
  if (!notes) return { ok: false, detail: "notes must be https under github.com/Swarm-Official/ or swarm.green/" };
  return {
    ok: true,
    target: {
      chromium: value.chromium,
      swarm: value.swarm,
      installer: installer.artifact,
      portable: portable.artifact,
      notes,
    },
  };
}

/**
 * Reads the payload bytes. Only ever called on bytes whose signature has
 * already been checked; unknown fields are ignored so that a later format can
 * add some without breaking builds that are already out there.
 */
export function parsePayload(payloadBytes) {
  const text = utf8(payloadBytes);
  if (text === null) return reject("bad_payload", "not UTF-8");
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (_) {
    return reject("bad_payload", "not JSON");
  }
  if (!isPlainObject(payload)) return reject("bad_payload", "not a JSON object");
  if (payload.product !== PRODUCT) return reject("wrong_product");
  const publishedMs = parsePublished(payload.published);
  if (publishedMs === null) return reject("bad_payload", "published must look like 2026-09-27T18:00:00Z");
  if (!isPlainObject(payload.targets)) return reject("bad_payload", "targets must be an object");
  const names = Object.keys(payload.targets);
  if (names.length === 0 || names.length > MAX_TARGETS) return reject("bad_payload", "targets is empty or too long");
  const targets = {};
  for (const name of names) {
    if (!TARGET_NAME.test(name)) return reject("bad_payload", `target name "${name}"`);
    const parsed = parseTarget(payload.targets[name]);
    if (!parsed.ok) return reject("bad_payload", `${name}: ${parsed.detail}`);
    targets[name] = parsed.target;
  }
  return { ok: true, payload: { product: PRODUCT, published: payload.published, publishedMs, targets } };
}

/* ── the envelope and its signature ─────────────────────────────────────── */

/** Takes the envelope apart; checks shapes and sizes, trusts nothing yet. */
export function parseEnvelope(body) {
  const bytes = toBytes(body);
  if (!bytes) return reject("bad_envelope");
  if (bytes.length > MAX_FEED_BYTES) return reject("too_large");
  const text = utf8(bytes);
  if (text === null) return reject("bad_envelope", "not UTF-8");
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch (_) {
    return reject("bad_envelope", "not JSON");
  }
  if (!isPlainObject(envelope)) return reject("bad_envelope", "not a JSON object");
  if (envelope.format !== FEED_FORMAT) return reject("bad_format");
  if (envelope.signature === undefined || envelope.signature === null || envelope.signature === "") {
    return reject("unsigned");
  }
  if (typeof envelope.payload !== "string" || envelope.payload === "") return reject("bad_envelope", "payload");
  const payloadBytes = decodeBase64(envelope.payload);
  if (!payloadBytes || payloadBytes.length === 0) return reject("bad_envelope", "payload is not base64");
  if (payloadBytes.length > MAX_PAYLOAD_BYTES) return reject("too_large");
  const signature = typeof envelope.signature === "string" ? decodeBase64(envelope.signature) : null;
  if (!signature || signature.length !== ED25519_SIGNATURE_BYTES) return reject("bad_signature", "malformed");
  return { ok: true, payloadBytes, signature };
}

/**
 * Checks `signature` over `payloadBytes` against each public key in turn
 * (base64 of the 32 raw Ed25519 bytes). `subtle` is WebCrypto's SubtleCrypto:
 * crypto.subtle in the browser, node:crypto's webcrypto.subtle in the tests.
 */
export async function verifySignature(subtle, publicKeys, payloadBytes, signature) {
  const keys = Array.isArray(publicKeys) ? publicKeys : [];
  let wellFormed = 0;
  let imported = 0;
  for (let index = 0; index < keys.length; index += 1) {
    const raw = decodeBase64(keys[index]);
    if (!raw || raw.length !== ED25519_PUBLIC_KEY_BYTES) continue;
    wellFormed += 1;
    if (!subtle || typeof subtle.importKey !== "function") continue;
    let key;
    try {
      key = await subtle.importKey("raw", raw, { name: "Ed25519" }, false, ["verify"]);
    } catch (_) {
      continue; // NotSupportedError where Ed25519 is missing
    }
    imported += 1;
    let valid = false;
    try {
      valid = await subtle.verify({ name: "Ed25519" }, key, signature, payloadBytes);
    } catch (_) {
      valid = false;
    }
    if (valid === true) return { ok: true, keyIndex: index };
  }
  if (wellFormed === 0) return reject("no_key");
  if (imported === 0) return reject("no_ed25519");
  return reject("bad_signature");
}

/* ── the decision ───────────────────────────────────────────────────────── */

/**
 * The whole check, in the order that matters: size and shape, then the
 * signature over the exact payload bytes, then what the payload says, then no
 * rollback, then the comparison with the running build.
 *
 * @param {object} args
 * @param {Uint8Array|ArrayBuffer|string} args.body   the feed as fetched
 * @param {string[]} args.publicKeys                   base64 raw Ed25519 keys
 * @param {SubtleCrypto} args.subtle
 * @param {{chromium:string,swarm:string,channel:string}} args.running
 * @param {?string} args.target                        e.g. "windows-x64"
 * @param {?string} args.lastPublished                 the last accepted `published`
 * @returns {Promise<object>} `{ok:false, code, message}` or
 *   `{ok:true, status:"offer"|"latest"|"no-target", published, build}`
 */
export async function checkFeed({ body, publicKeys, subtle, running, target, lastPublished = null }) {
  const run = parseRunning(running);
  if (!run.ok) return run;
  const envelope = parseEnvelope(body);
  if (!envelope.ok) return envelope;
  const signed = await verifySignature(subtle, publicKeys, envelope.payloadBytes, envelope.signature);
  if (!signed.ok) return signed;
  const parsed = parsePayload(envelope.payloadBytes);
  if (!parsed.ok) return parsed;
  const { payload } = parsed;

  if (lastPublished !== null && lastPublished !== undefined) {
    const lastMs = parsePublished(lastPublished);
    if (lastMs !== null && payload.publishedMs < lastMs) return reject("rollback");
  }

  const common = {
    ok: true,
    published: payload.published,
    publishedMs: payload.publishedMs,
    target,
    keyIndex: signed.keyIndex,
  };
  const entry =
    typeof target === "string" && Object.prototype.hasOwnProperty.call(payload.targets, target)
      ? payload.targets[target]
      : null;
  if (!entry) return { ...common, status: "no-target", build: null };

  const order = compareBuilds(entry, run);
  if (order === null) return reject("bad_payload", "version");
  if (order < 0) return reject("older");
  return { ...common, status: order === 0 ? "latest" : "offer", build: entry };
}
