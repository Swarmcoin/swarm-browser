/**
 * SWARM Start's three switches (lib/settings.js).
 */
import assert from "node:assert/strict";
import test from "node:test";

import "./helpers.mjs";
import { DEFAULTS, STORAGE_KEY, motionAllowed, normalize, withChange } from "../../extensions/start/lib/settings.js";

test("defaults: background on, motion on, live network tile OFF", () => {
  assert.deepEqual({ ...DEFAULTS }, { background: true, motion: true, networkTile: false });
  assert.equal(STORAGE_KEY, "startSettings");
  assert.ok(Object.isFrozen(DEFAULTS));
});

test("nothing stored, or garbage stored, gives the defaults", () => {
  for (const stored of [undefined, null, 0, "on", [], { networkTile: "yes" }, { networkTile: 1 }]) {
    assert.deepEqual(normalize(stored), { ...DEFAULTS }, JSON.stringify(stored));
  }
});

test("stored booleans win; unknown keys are dropped", () => {
  assert.deepEqual(normalize({ background: false, networkTile: true, extra: true }), {
    background: false,
    motion: true,
    networkTile: true,
  });
});

test("withChange changes one known switch and nothing else", () => {
  const base = normalize(null);
  assert.deepEqual(withChange(base, "networkTile", true), { ...DEFAULTS, networkTile: true });
  assert.deepEqual(withChange(base, "motion", false), { ...DEFAULTS, motion: false });
  assert.deepEqual(withChange(base, "fetchEverything", true), { ...DEFAULTS });
  assert.deepEqual(withChange(base, "motion", "false"), { ...DEFAULTS });
  assert.deepEqual(base, { ...DEFAULTS }, "the input is not modified");
});

test("motion needs the switch, the background, and no reduced-motion request", () => {
  assert.equal(motionAllowed(DEFAULTS, false), true);
  assert.equal(motionAllowed(DEFAULTS, true), false);
  assert.equal(motionAllowed({ ...DEFAULTS, motion: false }, false), false);
  assert.equal(motionAllowed({ ...DEFAULTS, background: false }, false), false);
});
