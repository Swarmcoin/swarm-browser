/**
 * swarm/install_swarm_assets.py, the step that copies the three extensions
 * into the Chromium tree, run for real against a small stand-in tree.
 *
 * It must copy every file byte for byte except one: swarm_update/version.json,
 * which it stamps with the real Chromium version, the SWARM revision and
 * channel "release". Needs Python on the PATH; skipped without it.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { EXTENSION_DIR, REPO_ROOT } from "./helpers.mjs";

const PYTHON = ["python", "python3", "py"].find((exe) => spawnSync(exe, ["--version"], { encoding: "utf8" }).status === 0);
const SCRIPT = path.join(REPO_ROOT, "swarm", "install_swarm_assets.py");
const ICONS = path.join(REPO_ROOT, "swarm", "brand", "icons");
const EXTENSIONS = path.join(REPO_ROOT, "swarm", "extensions");
const WORK = mkdtempSync(path.join(os.tmpdir(), "swarm-update-install-"));
test.after(() => rmSync(WORK, { recursive: true, force: true }));

function walk(dir, base = dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join("/")];
  });
}

/** Just enough of a Chromium tree for the script: the upstream icon files and the resources folder. */
function standInTree(name) {
  const tree = path.join(WORK, name);
  for (const icon of walk(ICONS)) {
    const target = path.join(tree, "chrome", "app", "theme", "chromium", icon);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, "upstream icon");
  }
  mkdirSync(path.join(tree, "chrome", "browser", "resources"), { recursive: true });
  return tree;
}

function install(args) {
  return spawnSync(PYTHON, [SCRIPT, ...args], { encoding: "utf8", cwd: REPO_ROOT });
}

const expected = {
  chromium: readFileSync(path.join(REPO_ROOT, "ungoogled-chromium", "chromium_version.txt"), "utf8").trim(),
  swarm: readFileSync(path.join(REPO_ROOT, "swarm", "revision.txt"), "utf8").trim(),
  channel: "release",
};

test("the three extensions are copied, and only version.json is stamped", { skip: !PYTHON && "no Python" }, () => {
  const tree = standInTree("tree");
  const placeholder = readFileSync(path.join(EXTENSION_DIR, "version.json"), "utf8");
  const run = install(["--source-tree", tree]);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /extension: chrome[\\/]browser[\\/]resources[\\/]swarm_update/);
  assert.match(run.stdout, /SWARM assets installed: \d+ icon files, 3 extensions/);
  assert.match(run.stdout, /update: version\.json -> chromium \d+\.\d+\.\d+\.\d+, swarm \d+, channel release/);

  const resources = path.join(tree, "chrome", "browser", "resources");
  const stamped = readFileSync(path.join(resources, "swarm_update", "version.json"), "utf8");
  assert.equal(stamped, `${JSON.stringify(expected)}\n`);
  assert.deepEqual(JSON.parse(stamped), expected);

  for (const [folder, dirname] of [["wallet", "swarm_wallet"], ["rewards", "swarm_rewards"], ["update", "swarm_update"]]) {
    const source = path.join(EXTENSIONS, folder);
    const copied = path.join(resources, dirname);
    assert.deepEqual(walk(copied).sort(), walk(source).sort(), folder);
    for (const file of walk(source)) {
      if (folder === "update" && file === "version.json") continue;
      assert.ok(readFileSync(path.join(copied, file)).equals(readFileSync(path.join(source, file))), `${dirname}/${file}`);
    }
  }
  // The committed placeholder is untouched: only the tree's copy changes.
  assert.equal(readFileSync(path.join(EXTENSION_DIR, "version.json"), "utf8"), placeholder);
});

test("while the feed key is a development key, every build says so", { skip: !PYTHON && "no Python" }, () => {
  const run = install(["--source-tree", standInTree("tree-warning")]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /WARNING: SWARM Update trusts a DEVELOPMENT feed key \(dev-/);
});

test("a dry run reports the stamp and writes nothing", { skip: !PYTHON && "no Python" }, () => {
  const tree = standInTree("tree-dry");
  const run = install(["--source-tree", tree, "--dry-run"]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /update: version\.json -> chromium/);
  assert.equal(existsSync(path.join(tree, "chrome", "browser", "resources", "swarm_update")), false);
});
