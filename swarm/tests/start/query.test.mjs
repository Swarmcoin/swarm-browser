/**
 * SWARM Start's search box: address or search? (lib/query.js)
 */
import assert from "node:assert/strict";
import test from "node:test";

import "./helpers.mjs";
import { decide } from "../../extensions/start/lib/query.js";

const url = (u) => ({ kind: "url", url: u });
const search = (t) => ({ kind: "search", text: t });

test("empty and blank input do nothing", () => {
  for (const input of ["", "   ", "\t\n", null, undefined, "?", "?   "]) {
    assert.deepEqual(decide(input), { kind: "empty" }, JSON.stringify(input));
  }
});

test("full http, https and chrome addresses open as typed", () => {
  assert.deepEqual(decide("https://swarm.green"), url("https://swarm.green/"));
  assert.deepEqual(decide("  https://mainnet.explore.swarm.green/block/5065  "), url("https://mainnet.explore.swarm.green/block/5065"));
  assert.deepEqual(decide("http://example.com/a?b=c#d"), url("http://example.com/a?b=c#d"));
  assert.deepEqual(decide("HTTPS://SWARM.GREEN/Mining"), url("https://swarm.green/Mining"));
  assert.deepEqual(decide("chrome://settings/search"), url("chrome://settings/search"));
});

test("a bare host name gets https://", () => {
  assert.deepEqual(decide("swarm.green"), url("https://swarm.green/"));
  assert.deepEqual(decide("swarm.green/ecosystem/browser"), url("https://swarm.green/ecosystem/browser"));
  assert.deepEqual(decide("mainnet.explore.swarm.green"), url("https://mainnet.explore.swarm.green/"));
  assert.deepEqual(decide("swarm.green:8443/x"), url("https://swarm.green:8443/x"));
  assert.deepEqual(decide("example.co.uk?q=1"), url("https://example.co.uk/?q=1"));
  assert.deepEqual(decide("xn--bcher-kva.example"), url("https://xn--bcher-kva.example/"));
});

test("localhost and IPv4 addresses get http://", () => {
  assert.deepEqual(decide("localhost"), url("http://localhost/"));
  assert.deepEqual(decide("localhost:3000/api"), url("http://localhost:3000/api"));
  assert.deepEqual(decide("127.0.0.1:8080"), url("http://127.0.0.1:8080/"));
  assert.deepEqual(decide("192.168.1.1"), url("http://192.168.1.1/"));
});

test("anything with a space is a search", () => {
  assert.deepEqual(decide("swarm wallet"), search("swarm wallet"));
  assert.deepEqual(decide("what is swarm.green"), search("what is swarm.green"));
  assert.deepEqual(decide("https://a b"), search("https://a b"));
});

test("a leading ? forces a search", () => {
  assert.deepEqual(decide("?swarm.green"), search("swarm.green"));
  assert.deepEqual(decide("? https://x.y"), search("https://x.y"));
});

test("single words, numbers and dotted numbers are searches", () => {
  assert.deepEqual(decide("swarm"), search("swarm"));
  assert.deepEqual(decide("3.14"), search("3.14"));
  assert.deepEqual(decide("1.2.3"), search("1.2.3"));
  assert.deepEqual(decide("v1.0"), search("v1.0"));
  assert.deepEqual(decide("999.1.1.1"), search("999.1.1.1"));
});

test("dangerous or odd schemes are never opened, only searched for", () => {
  for (const input of [
    "javascript:alert(1)",
    "JavaScript:void(0)",
    "data:text/html,<b>x</b>",
    "file:///C:/Windows/win.ini",
    "vbscript:msgbox",
    "mailto:someone@swarm.green",
    "about:blank",
    "chrome-extension://gmmgmodmgnigcgboccjelpgedejejfap/popup.html",
  ]) {
    assert.equal(decide(input).kind, "search", input);
  }
});
