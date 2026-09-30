/**
 * Turning the two public SWARM mainnet status files into the words on the
 * "Network now" tile.
 *
 *   https://lwd-main.swarm.green/status.json     schema swarm-network-status/1
 *   https://swarm.green/data/swarm-map-live.json schema swarm-map-live/1
 *
 * Pure. Anything unexpected -- another schema, another network, a missing
 * number -- becomes null and the tile says it could not read the network,
 * rather than showing a number it cannot vouch for.
 */

export const STATUS_URL = "https://lwd-main.swarm.green/status.json";
export const MAP_URL = "https://swarm.green/data/swarm-map-live.json";
export const NETWORK_LABEL = "SWARM mainnet";
const MAINNET_ID = "SwarmMainnet";

/** 5065 -> "5,065". Not a number -> "—". */
export function formatCount(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "—";
  return Math.floor(value).toLocaleString("en-US");
}

/** Seconds -> "just now", "40 s ago", "3 min ago", "2 h ago", "5 days ago". */
export function formatAge(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "";
  const s = Math.max(0, Math.round(seconds));
  if (s < 5) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

/** The block height from status.json, or null. Refuses anything but mainnet. */
export function readStatus(status) {
  if (!status || typeof status !== "object") return null;
  if (status.schema !== "swarm-network-status/1" || status.network !== MAINNET_ID) return null;
  const node = status.node || {};
  if (typeof node.height !== "number" || !Number.isFinite(node.height)) return null;
  const at = Date.parse(status.server_time_utc || "");
  return { height: node.height, up: node.up === true, at: Number.isFinite(at) ? at : null };
}

/** The number of nodes online from swarm-map-live.json, or null. */
export function readMap(map) {
  if (!map || typeof map !== "object" || map.schema !== "swarm-map-live/1") return null;
  if (typeof map.nodes_online !== "number" || !Number.isFinite(map.nodes_online)) return null;
  const at = Date.parse(map.updated || "");
  return { nodesOnline: map.nodes_online, at: Number.isFinite(at) ? at : null };
}

/**
 * Everything the tile shows, from the two parsed files (either may be null
 * when its request failed) and the time now.
 */
export function networkSummary(status, map, nowMs) {
  const s = readStatus(status);
  const m = readMap(map);
  if (!s && !m) return { ok: false, network: NETWORK_LABEL, message: "Could not read SWARM mainnet just now." };
  const times = [s && s.at, m && m.at].filter((t) => typeof t === "number");
  const newest = times.length ? Math.max(...times) : null;
  return {
    ok: true,
    network: NETWORK_LABEL,
    height: s ? formatCount(s.height) : "—",
    nodesOnline: m ? formatCount(m.nodesOnline) : "—",
    updated: newest === null ? "" : formatAge((nowMs - newest) / 1000),
  };
}
