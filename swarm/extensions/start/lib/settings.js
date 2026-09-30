/**
 * The Start page's three switches, kept in chrome.storage.local under one key.
 *
 * Pure: the page reads the stored object and passes it through normalize(),
 * so a missing, older or damaged value always becomes the defaults below.
 *
 * The live network tile is OFF by default on purpose: a new tab must not ask
 * any server anything until the person has turned that on.
 */

export const STORAGE_KEY = "startSettings";

export const DEFAULTS = Object.freeze({
  /** The drawn SWARM background (gradient and comb). Off = plain dark. */
  background: true,
  /** The slow comb drift. Also off whenever the system asks for reduced motion. */
  motion: true,
  /** The "Network now" tile. Off = no request to any server from this page. */
  networkTile: false,
});

/** Defaults, overlaid with every stored value that is a real boolean. */
export function normalize(stored) {
  const out = { ...DEFAULTS };
  if (!stored || typeof stored !== "object") return out;
  for (const key of Object.keys(DEFAULTS)) {
    if (typeof stored[key] === "boolean") out[key] = stored[key];
  }
  return out;
}

/** One switch changed; anything that is not a known switch is ignored. */
export function withChange(current, key, value) {
  const next = normalize(current);
  if (Object.prototype.hasOwnProperty.call(DEFAULTS, key) && typeof value === "boolean") {
    next[key] = value;
  }
  return next;
}

/** Whether the page may animate: the switch AND the system's preference. */
export function motionAllowed(settings, prefersReducedMotion) {
  return Boolean(normalize(settings).motion && normalize(settings).background && !prefersReducedMotion);
}
