/**
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
  Object.freeze({ label: "dev-2026-09-27", publicKey: "20BU1HVHS5mgepkE5wmabS57ExR57ovH7JiGYqkf+SU=" }),
]);
