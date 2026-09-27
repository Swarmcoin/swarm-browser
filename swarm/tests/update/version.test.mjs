/**
 * Version comparison, the running build's version.json, and the platform name.
 */

import assert from "node:assert/strict";
import test from "node:test";

import "./helpers.mjs";
import {
  buildKey,
  compareBuilds,
  parseChromiumVersion,
  parseRunning,
  parseSwarmRevision,
  targetFor,
} from "../../extensions/update/lib/feed.js";

const b = (chromium, swarm) => ({ chromium, swarm });

test("chromium versions are compared part by part, as numbers", () => {
  assert.equal(compareBuilds(b("153.0.8010.100", "1"), b("153.0.8010.99", "1")), 1);
  assert.equal(compareBuilds(b("153.0.8010.99", "1"), b("153.0.8010.100", "1")), -1);
  assert.equal(compareBuilds(b("154.0.0.0", "1"), b("153.9.9999.9999", "9")), 1);
  assert.equal(compareBuilds(b("153.1.0.0", "1"), b("153.0.9999.0", "1")), 1);
  assert.equal(compareBuilds(b("153.0.8011.0", "1"), b("153.0.8010.52", "1")), 1);
  assert.equal(compareBuilds(b("10.0.0.0", "1"), b("9.0.0.0", "1")), 1);
});

test("the Chromium version decides first, the SWARM revision breaks ties", () => {
  assert.equal(compareBuilds(b("153.0.8010.60", "1"), b("153.0.8010.52", "9")), 1);
  assert.equal(compareBuilds(b("153.0.8010.52", "2"), b("153.0.8010.52", "1")), 1);
  assert.equal(compareBuilds(b("153.0.8010.52", "10"), b("153.0.8010.52", "9")), 1);
  assert.equal(compareBuilds(b("153.0.8010.52", "1"), b("153.0.8010.52", "1")), 0);
  assert.equal(compareBuilds(b("153.0.8010.52", "1"), b("153.0.8010.52", "2")), -1);
});

test("anything that is not a build does not compare", () => {
  assert.equal(compareBuilds(b("153.0.8010", "1"), b("153.0.8010.52", "1")), null);
  assert.equal(compareBuilds(b("153.0.8010.52", ""), b("153.0.8010.52", "1")), null);
  assert.equal(compareBuilds(null, b("153.0.8010.52", "1")), null);
  assert.equal(compareBuilds(b("153.0.8010.52", 1), b("153.0.8010.52", "1")), null);
});

test("version strings are parsed strictly", () => {
  assert.deepEqual(parseChromiumVersion("153.0.8010.52"), [153, 0, 8010, 52]);
  assert.deepEqual(parseChromiumVersion("0.0.0.0"), [0, 0, 0, 0]);
  for (const bad of ["153.0.8010", "153.0.8010.52.1", "v153.0.8010.52", "153.0.8010.52 ", "153.00.8010.52", "1234567890.0.0.0", "", null]) {
    assert.equal(parseChromiumVersion(bad), null, String(bad));
  }
  assert.equal(parseSwarmRevision("0"), 0);
  assert.equal(parseSwarmRevision("12"), 12);
  for (const bad of ["01", "-1", "1.0", " 1", "", 1, null]) {
    assert.equal(parseSwarmRevision(bad), null, String(bad));
  }
});

test("the running build: the committed placeholder and a stamped release both parse", () => {
  assert.deepEqual(parseRunning({ chromium: "0.0.0.0", swarm: "0", channel: "dev" }), {
    ok: true,
    chromium: "0.0.0.0",
    swarm: "0",
    channel: "dev",
  });
  assert.equal(parseRunning({ chromium: "153.0.8010.52", swarm: "1", channel: "release" }).ok, true);
});

test("a version.json that is damaged or has an unknown channel is refused", () => {
  for (const bad of [
    null,
    "153.0.8010.52",
    {},
    { chromium: "153.0.8010.52", swarm: "1" },
    { chromium: "153.0.8010.52", swarm: "1", channel: "beta" },
    { chromium: "153.0.8010", swarm: "1", channel: "release" },
    { chromium: "153.0.8010.52", swarm: 1, channel: "release" },
  ]) {
    const parsed = parseRunning(bad);
    assert.equal(parsed.ok, false, JSON.stringify(bad));
    assert.equal(parsed.code, "bad_version");
  }
});

test("the feed's platform names follow chrome.runtime.getPlatformInfo()", () => {
  assert.equal(targetFor("win", "x86-64"), "windows-x64");
  assert.equal(targetFor("win", "x86-32"), "windows-x86");
  assert.equal(targetFor("win", "arm64"), "windows-arm64");
  assert.equal(targetFor("mac", "arm64"), "macos-arm64");
  assert.equal(targetFor("linux", "x86-64"), "linux-x64");
  assert.equal(targetFor("cros", "x86-64"), null);
  assert.equal(targetFor("win", "mips64"), null);
  assert.equal(targetFor(undefined, undefined), null);
});

test("a build's key names it", () => {
  assert.equal(buildKey(b("153.0.8010.60", "2")), "153.0.8010.60+2");
});
