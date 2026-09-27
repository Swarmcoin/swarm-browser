/**
 * One update check: which address to ask, the exact request, and what to
 * remember afterwards.
 *
 * `fetch` is passed in rather than taken from the global scope, so that the
 * node:test suites can hand in a fake one and prove the whole check without
 * touching the network, and so that this file cannot make a request nobody
 * asked it to.
 */

import { FEED_ORIGIN, FEED_URL, MAX_FEED_BYTES, checkFeed, parseRunning, reject } from "./feed.js";
import { normalizeStored } from "./state.js";

export const FETCH_TIMEOUT_MS = 30 * 1000;

/**
 * The request, the same in every SWARM Browser on every day.
 *
 * No cookies (`credentials: "omit"`), nothing from or into the HTTP cache
 * (`cache: "no-store"`, so no ETag or If-Modified-Since either), no Referer,
 * and no query string. Accept-Language is pinned to "*" so the person's
 * language list, which the browser would otherwise add, is not sent.
 * What remains is what the browser adds to any request and is the same for
 * everyone on the same version: User-Agent, Accept-Encoding and the
 * Sec-Fetch-* headers. (The Edge smoke test records the headers that arrive:
 * no Cookie, no Referer, no Origin.) swarm.green, like any website, sees the
 * internet address the request comes from.
 */
export const REQUEST_INIT = Object.freeze({
  method: "GET",
  mode: "cors",
  credentials: "omit",
  cache: "no-store",
  redirect: "follow",
  referrerPolicy: "no-referrer",
  headers: Object.freeze({ Accept: "application/json", "Accept-Language": "*" }),
});

/**
 * The address to ask. A release build asks FEED_URL and nothing else. Only a
 * development copy (version.json channel "dev") may be pointed elsewhere, for
 * testing, and even then only at another plain path on https://swarm.green,
 * which is all the manifest's connect-src and host permission allow anyway.
 */
export function chooseFeedUrl(channel, custom) {
  if (channel !== "dev" || custom === undefined || custom === null || custom === "") {
    return { ok: true, url: FEED_URL, custom: false };
  }
  if (typeof custom !== "string" || custom.includes("?") || custom.includes("#")) return reject("bad_custom_url");
  let url;
  try {
    url = new URL(custom);
  } catch (_) {
    return reject("bad_custom_url");
  }
  if (url.origin !== FEED_ORIGIN || url.username || url.password || url.href !== custom) {
    return reject("bad_custom_url");
  }
  return { ok: true, url: url.href, custom: true };
}

async function readCapped(response, maxBytes, controller) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const whole = new Uint8Array(await response.arrayBuffer());
    return whole.length > maxBytes ? null : whole;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch (_) {
        /* already gone */
      }
      controller.abort();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Fetches the feed with REQUEST_INIT, a timeout and a size cap, and checks
 * that the answer came from swarm.green even after redirects.
 *
 * @returns {Promise<{ok:true, bytes:Uint8Array, url:string} | {ok:false, code:string, message:string}>}
 */
export async function fetchFeed(fetchImpl, url, { timeoutMs = FETCH_TIMEOUT_MS, maxBytes = MAX_FEED_BYTES } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(url, { ...REQUEST_INIT, headers: { ...REQUEST_INIT.headers }, signal: controller.signal });
    } catch (_) {
      return reject(controller.signal.aborted ? "timeout" : "network");
    }
    if (!response) return reject("network");
    const finalUrl = typeof response.url === "string" && response.url ? response.url : url;
    let origin = null;
    try {
      origin = new URL(finalUrl).origin;
    } catch (_) {
      origin = null;
    }
    if (origin !== FEED_ORIGIN) return reject("wrong_origin");
    if (response.status === 404) return reject("not_published");
    if (!response.ok) return { ...reject("http", `HTTP ${response.status}`), httpStatus: response.status };
    const declared =
      response.headers && typeof response.headers.get === "function"
        ? Number(response.headers.get("content-length"))
        : Number.NaN;
    if (Number.isFinite(declared) && declared > maxBytes) return reject("too_large");
    const bytes = await readCapped(response, maxBytes, controller);
    if (bytes === null) return reject("too_large");
    return { ok: true, bytes, url: finalUrl };
  } catch (_) {
    return reject(controller.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The whole check: choose the address, fetch, verify, decide, and return the
 * two things to store. A refused feed changes nothing but `lastCheck`: an
 * offer accepted yesterday still stands if today's answer is broken.
 *
 * @returns {Promise<{lastCheck:object, accepted:?object}>}
 */
export async function runCheck({ fetchImpl, subtle, nowMs, running, target, stored, publicKeys, fetchOptions }) {
  const at = new Date(nowMs).toISOString();
  const state = normalizeStored(stored);
  const failed = (result, extra = {}) => ({
    lastCheck: {
      at,
      ok: false,
      status: null,
      code: result.code,
      message: result.message,
      detail: result.detail || null,
      published: null,
      ...extra,
    },
    accepted: state.accepted,
  });

  const run = parseRunning(running);
  if (!run.ok) return failed(run, { url: null, custom: false });
  const choice = chooseFeedUrl(run.channel, state.feedUrl);
  if (!choice.ok) return failed(choice, { url: null, custom: true });

  const fetched = await fetchFeed(fetchImpl, choice.url, fetchOptions);
  if (!fetched.ok) return failed(fetched, { url: choice.url, custom: choice.custom });

  const result = await checkFeed({
    body: fetched.bytes,
    publicKeys,
    subtle,
    running: run,
    target,
    lastPublished: state.accepted ? state.accepted.published : null,
  });
  if (!result.ok) return failed(result, { url: choice.url, custom: choice.custom });

  return {
    lastCheck: {
      at,
      ok: true,
      status: result.status,
      code: null,
      message: null,
      detail: null,
      published: result.published,
      url: choice.url,
      custom: choice.custom,
    },
    accepted: { at, published: result.published, target, build: result.build },
  };
}
