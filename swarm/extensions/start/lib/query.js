/**
 * What the Start page's search box does with what was typed: open it as an
 * address, or hand it to the browser's default search engine.
 *
 * Pure: no browser API, so swarm/tests/start runs it under `node --test`.
 *
 * The rules are deliberately small and predictable:
 *   - a leading "?" always means "search for the rest";
 *   - anything with a space in it is a search;
 *   - http, https and chrome addresses are opened as typed;
 *   - javascript:, data:, file: and every other scheme are never opened from
 *     here -- they are searched for as text instead;
 *   - "localhost", an IPv4 address or a name with a dot and a letters-only
 *     ending ("swarm.green", "explore.swarm.green/block/5") is an address and
 *     gets https:// in front (http:// for localhost and plain IP addresses,
 *     which rarely have a certificate);
 *   - everything else is a search.
 */

const OPENABLE_SCHEMES = new Set(["http:", "https:", "chrome:"]);
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const HOST_WITH_TLD = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})\.?(?::\d{1,5})?(?:[/?#].*)?$/i;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::\d{1,5})?(?:[/?#].*)?$/;
const LOCALHOST = /^localhost(?::\d{1,5})?(?:[/?#].*)?$/i;

function validUrl(text) {
  try {
    const url = new URL(text);
    return url.href;
  } catch (_) {
    return null;
  }
}

function ipv4Ok(match) {
  return match.slice(1, 5).every((part) => Number(part) <= 255);
}

/**
 * @param {string} input what the person typed
 * @returns {{kind: "empty"} | {kind: "url", url: string} | {kind: "search", text: string}}
 */
export function decide(input) {
  const text = String(input == null ? "" : input).trim();
  if (!text) return { kind: "empty" };

  if (text.startsWith("?")) {
    const rest = text.slice(1).trim();
    return rest ? { kind: "search", text: rest } : { kind: "empty" };
  }
  if (/\s/.test(text)) return { kind: "search", text };

  const scheme = SCHEME.exec(text);
  if (scheme && !/^\d+$/.test(text.slice(scheme[0].length).split(/[/?#]/)[0])) {
    // "localhost:3000" and "swarm.green:443" look like a scheme; they are not.
    const name = scheme[1].toLowerCase() + ":";
    if (OPENABLE_SCHEMES.has(name)) {
      const url = validUrl(text);
      if (url) return { kind: "url", url };
    }
    if (!LOCALHOST.test(text) && !HOST_WITH_TLD.test(text)) return { kind: "search", text };
  }

  if (LOCALHOST.test(text)) {
    const url = validUrl(`http://${text}`);
    if (url) return { kind: "url", url };
  }
  const ip = IPV4.exec(text);
  if (ip) {
    if (!ipv4Ok(ip)) return { kind: "search", text };
    const url = validUrl(`http://${text}`);
    if (url) return { kind: "url", url };
  }
  if (HOST_WITH_TLD.test(text)) {
    const url = validUrl(`https://${text}`);
    if (url) return { kind: "url", url };
  }
  return { kind: "search", text };
}
