/**
 * Shared by gen-key.mjs, make-feed.mjs, sign-feed.mjs and verify-feed.mjs.
 *
 * The feed rules themselves are NOT here: every tool imports them from the
 * extension (swarm/extensions/update/lib/feed.js), so the tools and the
 * browser can never disagree about what a valid feed is.
 */

import { createHash } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..");
export const EXTENSION_DIR = path.join(REPO_ROOT, "swarm", "extensions", "update");
export const FEED_KEY_FILE = path.join(EXTENSION_DIR, "lib", "feed-key.js");

/** Where the development feed key lives on the SWARM build PC, outside every repository. */
export const DEFAULT_DEV_KEY = "D:/swarm-work/keys/update-feed-dev.pem";

export function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

/**
 * Node 22 prints an ExperimentalWarning the first time WebCrypto's Ed25519 is
 * used. It is the same algorithm the browser uses and the tools rely on it on
 * purpose, so that one warning is kept off the terminal; every other warning
 * still prints.
 */
export function quietEd25519Warning() {
  const original = process.emitWarning;
  process.emitWarning = function emitWarning(warning, ...rest) {
    const message = typeof warning === "string" ? warning : warning && warning.message;
    const type = typeof rest[0] === "string" ? rest[0] : rest[0] && rest[0].type;
    const name = warning && typeof warning === "object" ? warning.name : type;
    if ((type === "ExperimentalWarning" || name === "ExperimentalWarning") && /Ed25519/.test(String(message))) {
      return undefined;
    }
    return original.call(process, warning, ...rest);
  };
}

/** The folder holding `.git` at or above `target`, or null: is this inside a repository? */
export function gitWorkTreeOf(target) {
  let dir = path.resolve(target);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) dir = path.dirname(dir);
  for (;;) {
    if (existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The public keys a feed-key.js trusts: the extension's own unless told otherwise. */
export async function bakedFeedKeys(file = FEED_KEY_FILE) {
  const module = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  return module.FEED_KEYS.map((entry) => ({ label: entry.label, publicKey: entry.publicKey }));
}

/** The source of swarm/extensions/update/lib/feed-key.js for a list of keys. */
export function renderFeedKeyModule(keys) {
  const lines = keys.map(
    (key) => `  Object.freeze({ label: ${JSON.stringify(key.label)}, publicKey: ${JSON.stringify(key.publicKey)} }),`,
  );
  return `/**
 * The public key(s) that sign https://swarm.green/browser/updates.json.
 *
 * A feed is believed only if its signature verifies against one of these.
 * Each entry is the base64 of a raw 32-byte Ed25519 public key; the matching
 * private key is never in this repository.
 *
 * A label starting with "dev" is a DEVELOPMENT key, made for testing on the
 * build PC. Before any public release the owner makes the production key on
 * their own machine with swarm/updates/gen-key.mjs --write-extension-key and
 * commits the file that writes; install_swarm_assets.py warns on every build
 * that still carries a dev key. See swarm/updates/README.md.
 *
 * Written by swarm/updates/gen-key.mjs.
 */
export const FEED_KEYS = Object.freeze([
${lines.join("\n")}
]);
`;
}

/** The 32 raw bytes of an Ed25519 public KeyObject, as standard base64. */
export function rawPublicKeyBase64(publicKey) {
  const jwk = publicKey.export({ format: "jwk" });
  return Buffer.from(jwk.x, "base64url").toString("base64");
}

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("error", reject)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")));
  });
}

/** "now" as the feed writes it: UTC, whole seconds. */
export function isoSeconds(ms = Date.now()) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}
