/**
 * The "Network now" tile's figures (lib/format.js), from the two public
 * SWARM mainnet status files, in the shapes they had on 2026-09-30.
 */
import assert from "node:assert/strict";
import test from "node:test";

import "./helpers.mjs";
import {
  MAP_URL,
  NETWORK_LABEL,
  STATUS_URL,
  formatAge,
  formatCount,
  networkSummary,
  readMap,
  readStatus,
} from "../../extensions/start/lib/format.js";

const STATUS = {
  schema: "swarm-network-status/1",
  network: "SwarmMainnet",
  server_time_utc: "2026-09-30T18:01:17Z",
  ticker: "SWM",
  node: { up: true, height: 5065, peers: 14 },
};
const MAP = { schema: "swarm-map-live/1", updated: "2026-09-30T18:01:17Z", live: true, nodes_online: 15 };
const NOW = Date.parse("2026-09-30T18:01:57Z");

test("the two addresses are the public mainnet files, over https", () => {
  assert.equal(STATUS_URL, "https://lwd-main.swarm.green/status.json");
  assert.equal(MAP_URL, "https://swarm.green/data/swarm-map-live.json");
  assert.equal(NETWORK_LABEL, "SWARM mainnet");
});

test("formatCount", () => {
  assert.equal(formatCount(5065), "5,065");
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(1234567.9), "1,234,567");
  for (const bad of [-1, NaN, Infinity, "5065", null, undefined]) assert.equal(formatCount(bad), "—");
});

test("formatAge", () => {
  assert.equal(formatAge(0), "just now");
  assert.equal(formatAge(4.4), "just now");
  assert.equal(formatAge(40), "40 s ago");
  assert.equal(formatAge(61), "1 min ago");
  assert.equal(formatAge(3599), "59 min ago");
  assert.equal(formatAge(7200), "2 h ago");
  assert.equal(formatAge(3 * 86400), "3 days ago");
  assert.equal(formatAge(-30), "just now", "a clock ahead of the server is not 'in the future'");
  assert.equal(formatAge(NaN), "");
});

test("readStatus accepts SWARM mainnet only", () => {
  assert.deepEqual(readStatus(STATUS), { height: 5065, up: true, at: Date.parse("2026-09-30T18:01:17Z") });
  assert.equal(readStatus({ ...STATUS, network: "SwarmTestnet" }), null);
  assert.equal(readStatus({ ...STATUS, schema: "swarm-network-status/2" }), null);
  assert.equal(readStatus({ ...STATUS, node: { height: "5065" } }), null);
  assert.equal(readStatus(null), null);
});

test("readMap", () => {
  assert.deepEqual(readMap(MAP), { nodesOnline: 15, at: Date.parse("2026-09-30T18:01:17Z") });
  assert.equal(readMap({ ...MAP, nodes_online: "15" }), null);
  assert.equal(readMap({ ...MAP, schema: "other" }), null);
});

test("networkSummary: both files", () => {
  assert.deepEqual(networkSummary(STATUS, MAP, NOW), {
    ok: true,
    network: "SWARM mainnet",
    height: "5,065",
    nodesOnline: "15",
    updated: "40 s ago",
  });
});

test("networkSummary: one file missing still shows the other", () => {
  assert.equal(networkSummary(STATUS, null, NOW).height, "5,065");
  assert.equal(networkSummary(STATUS, null, NOW).nodesOnline, "—");
  assert.equal(networkSummary(null, MAP, NOW).nodesOnline, "15");
  assert.equal(networkSummary(null, MAP, NOW).height, "—");
});

test("networkSummary: nothing readable says so and shows no number", () => {
  const s = networkSummary(null, { schema: "x" }, NOW);
  assert.equal(s.ok, false);
  assert.equal(s.network, "SWARM mainnet");
  assert.match(s.message, /Could not read SWARM mainnet/);
  assert.equal(networkSummary({ ...STATUS, network: "SwarmTestnet" }, null, NOW).ok, false);
});
