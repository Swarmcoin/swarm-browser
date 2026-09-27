#!/usr/bin/env node
/**
 * Makes an Ed25519 key pair for signing the SWARM Browser update feed.
 *
 *   node swarm/updates/gen-key.mjs [--out <file>] [--label <name>]
 *                                  [--write-extension-key | --add-extension-key]
 *
 * The PRIVATE key is written to --out (default D:/swarm-work/keys/update-feed-dev.pem),
 * which must be outside every git repository: the tool refuses a path inside
 * one, and refuses to overwrite an existing file. Only the PUBLIC key is ever
 * printed, and only the public key goes into the extension:
 *
 *   --write-extension-key  make this the one key the extension trusts
 *                          (swarm/extensions/update/lib/feed-key.js)
 *   --add-extension-key    trust this key as well, e.g. an offline backup key
 *
 * The key this tool makes by default is a DEVELOPMENT key for testing. Before
 * any public release the owner makes the production key on their own machine
 * and puts its public half into the extension; see swarm/updates/README.md.
 */

import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import {
  DEFAULT_DEV_KEY,
  FEED_KEY_FILE,
  bakedFeedKeys,
  fail,
  gitWorkTreeOf,
  rawPublicKeyBase64,
  renderFeedKeyModule,
} from "./common.mjs";

const LABEL = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const USAGE =
  "node swarm/updates/gen-key.mjs [--out <file outside every repository>] [--label <name>]\n" +
  "                               [--write-extension-key | --add-extension-key]\n";

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        out: { type: "string", default: DEFAULT_DEV_KEY },
        label: { type: "string" },
        "write-extension-key": { type: "boolean", default: false },
        "add-extension-key": { type: "boolean", default: false },
        // For the tests: which feed-key.js to rewrite. Defaults to the extension's.
        "extension-key-file": { type: "string", default: FEED_KEY_FILE },
        help: { type: "boolean", default: false },
      },
      strict: true,
    }));
  } catch (error) {
    fail(`${error.message}\n${USAGE}`, 2);
  }
  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (values["write-extension-key"] && values["add-extension-key"]) {
    fail("give --write-extension-key or --add-extension-key, not both", 2);
  }

  const out = path.resolve(values.out);
  const label = values.label || `dev-${new Date().toISOString().slice(0, 10)}`;
  if (!LABEL.test(label)) fail(`label "${label}": use lowercase letters, digits, "." and "-"`, 2);

  const repository = gitWorkTreeOf(out);
  if (repository) {
    fail(
      `refusing to write a private key inside the git repository at ${repository}.\n` +
        "A key in a work tree is one `git add` away from being published. Choose a path outside every repository.",
    );
  }
  if (existsSync(out)) {
    fail(`refusing to overwrite ${out}: a private key is never replaced by accident. Move it away first if you mean it.`);
  }

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  const publicBase64 = rawPublicKeyBase64(publicKey);

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, pem, { flag: "wx", mode: 0o600 });

  process.stdout.write(`private key: ${out}  (kept there; never printed, never copied)\n`);
  process.stdout.write(`label:       ${label}\n`);
  process.stdout.write(`public key:  ${publicBase64}\n`);

  if (values["write-extension-key"] || values["add-extension-key"]) {
    const file = path.resolve(values["extension-key-file"]);
    const current = values["add-extension-key"] ? await bakedFeedKeys(file) : [];
    const keys = [...current.filter((key) => key.publicKey !== publicBase64), { label, publicKey: publicBase64 }];
    writeFileSync(file, renderFeedKeyModule(keys), "utf8");
    process.stdout.write(`extension:   ${file} now trusts ${keys.map((key) => key.label).join(", ")}\n`);
  }
}

main().catch((error) => fail(error && error.stack ? error.stack : String(error)));
