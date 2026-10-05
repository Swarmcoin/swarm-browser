/**
 * SWARM Start's lib/price.js is a copy of the SWARM Wallet's price module.
 * These tests keep it one: below its header it must be the wallet source
 * byte for byte (pinned by hash), and the same as the wallet copy bundled
 * beside it in swarm/extensions/wallet, so a wallet re-copy that changes the
 * price module fails here until the Start copy follows.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { EXTENSIONS_DIR, START_DIR } from "./helpers.mjs";

/** privacy-wallet c7fa1a67 browser/extension/lib/price.js, LF, as a sha256. */
const SOURCE_SHA256 = "7f1917940c7129c8f6bfdbeb9dce18614f24bd31316800764bbabac103331913";
const HEADER_END = "\n */\n";

/** A checkout on Windows may carry CRLF; the comparison is on the LF text git stores. */
const lf = (file) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

function startCopy() {
  const text = lf(path.join(START_DIR, "lib", "price.js"));
  const end = text.indexOf(HEADER_END);
  assert.ok(end > 0, "the SWARM Start header ends with a line ' */'");
  return { header: text.slice(0, end + HEADER_END.length), body: text.slice(end + HEADER_END.length) };
}

test("below its header, lib/price.js is the wallet source c7fa1a67 byte for byte", () => {
  const { header, body } = startCopy();
  assert.equal(createHash("sha256").update(body, "utf8").digest("hex"), SOURCE_SHA256);
  assert.match(header, /commit c7fa1a67/);
  assert.match(header, new RegExp(SOURCE_SHA256));
  assert.match(header, /--- end of the SWARM Start header ---/);
});

test("it is the same module as the wallet copy bundled in this browser", () => {
  const wallet = lf(path.join(EXTENSIONS_DIR, "wallet", "lib", "price.js"));
  assert.equal(startCopy().body, wallet);
});

test("the header says the storage key names are shared, the storage is not", () => {
  const { header } = startCopy();
  assert.match(header, /showSwmPrice/);
  assert.match(header, /separate storage/);
});
