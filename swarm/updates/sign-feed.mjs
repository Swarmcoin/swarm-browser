#!/usr/bin/env node
/**
 * Signs a payload and writes the feed envelope that goes on the website.
 *
 *   node swarm/updates/sign-feed.mjs --key <private key .pem> --payload payload.json --out updates.json
 *
 * The signature is Ed25519 over exactly the bytes of payload.json, and the
 * envelope carries those bytes in base64, so nothing is re-serialised between
 * signing and checking:
 *
 *   {"format": 1, "payload": "<base64 of payload.json>", "signature": "<base64 Ed25519>"}
 *
 * Before writing, the tool checks the payload with the extension's own rules,
 * refuses a private key kept inside a git repository, verifies its own
 * signature the way the browser will (WebCrypto Ed25519), and warns when the
 * key is not one the extension trusts (browsers built from this tree would
 * then reject the feed). The private key is read, never printed or copied.
 */

import { createPrivateKey, createPublicKey, sign, webcrypto } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { FEED_FORMAT, encodeBase64, parsePayload, verifySignature } from "../extensions/update/lib/feed.js";
import {
  DEFAULT_DEV_KEY,
  bakedFeedKeys,
  fail,
  gitWorkTreeOf,
  quietEd25519Warning,
  rawPublicKeyBase64,
  sha256File,
} from "./common.mjs";

quietEd25519Warning();

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        key: { type: "string", default: DEFAULT_DEV_KEY },
        payload: { type: "string" },
        out: { type: "string" },
        help: { type: "boolean", default: false },
      },
      strict: true,
    }));
  } catch (error) {
    fail(`${error.message}\nnode swarm/updates/sign-feed.mjs --key <private.pem> --payload payload.json --out updates.json`, 2);
  }
  if (values.help || !values.payload || !values.out) {
    fail("node swarm/updates/sign-feed.mjs --key <private.pem> --payload payload.json --out updates.json", values.help ? 0 : 2);
  }

  const keyFile = path.resolve(values.key);
  const repository = gitWorkTreeOf(keyFile);
  if (repository) {
    fail(`refusing to use a private key kept inside the git repository at ${repository}; move it out first.`);
  }
  let privateKey;
  try {
    privateKey = createPrivateKey(readFileSync(keyFile));
  } catch (error) {
    fail(`cannot read the private key ${keyFile}: ${error.message}`);
  }
  if (privateKey.asymmetricKeyType !== "ed25519") fail(`${keyFile} is not an Ed25519 key`);
  const publicBase64 = rawPublicKeyBase64(createPublicKey(privateKey));

  const payloadFile = path.resolve(values.payload);
  const payloadBytes = new Uint8Array(readFileSync(payloadFile));
  const parsed = parsePayload(payloadBytes);
  if (!parsed.ok) fail(`refusing to sign an invalid payload: ${parsed.detail || parsed.message}`);

  const signature = new Uint8Array(sign(null, payloadBytes, privateKey));
  const self = await verifySignature(webcrypto.subtle, [publicBase64], payloadBytes, signature);
  if (!self.ok) fail(`internal error: the new signature does not verify (${self.code})`);

  const envelope = { format: FEED_FORMAT, payload: encodeBase64(payloadBytes), signature: encodeBase64(signature) };
  const out = path.resolve(values.out);
  writeFileSync(out, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  const baked = await bakedFeedKeys();
  const trusted = baked.find((key) => key.publicKey === publicBase64);
  const { payload } = parsed;
  process.stdout.write(`feed:      ${out}\n`);
  process.stdout.write(`sha256:    ${await sha256File(out)}\n`);
  process.stdout.write(`published: ${payload.published}\n`);
  for (const [name, target] of Object.entries(payload.targets)) {
    process.stdout.write(`target:    ${name} ${target.chromium} SWARM ${target.swarm}\n`);
  }
  process.stdout.write(`key:       ${publicBase64}${trusted ? ` (${trusted.label}, trusted by the extension)` : ""}\n`);
  if (!trusted) {
    process.stderr.write(
      "WARNING: this key is not in swarm/extensions/update/lib/feed-key.js. Browsers built from this tree will reject this feed.\n",
    );
  } else if (trusted.label.startsWith("dev")) {
    process.stderr.write("NOTE: signed with a DEVELOPMENT key. Do not publish this feed for real users.\n");
  }
}

main().catch((error) => fail(error && error.stack ? error.stack : String(error)));
