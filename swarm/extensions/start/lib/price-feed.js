/**
 * When SWARM Start asks the SWARM price service, and what it remembers.
 * Shared by the new-tab page (newtab.js) and the price page (price-page.js).
 *
 * The rules (specs/PRICE-DISPLAY.md §2.2, §7):
 *  - nothing is asked before the switch has been read, and nothing at all
 *    while it is off (or when it cannot be read);
 *  - the page paints first from the remembered reading (`swmPriceLast`,
 *    greyed until confirmed), then asks once;
 *  - then once a minute, but only while the page is in view
 *    (`document.visibilityState === "visible"`): a new-tab page in a
 *    background tab asks nothing; coming back into view asks at once;
 *  - a reading under 20 s old, fetched by another SWARM Start tab, counts as
 *    fresh and is not asked for again, so opening five new tabs in a row
 *    makes one request, not five;
 *  - a failed or refused answer keeps the last good reading.
 *
 * Everything the outside world provides is passed in, so the whole schedule
 * runs under `node --test` with fake timers, a fake storage and a fake relay.
 */
import { LAST_PRICE_KEY, MIN_REFETCH_MS, POLL_MS, SHOW_PRICE_KEY, fromStored, toStored } from "./price.js";
import { REPAINT_MS, priceEnabled } from "./price-view.js";

/**
 * deps:
 *   storage        { get(defaults) -> Promise<object>, set(object) -> Promise }  (chrome.storage.local)
 *   fetchPrice     () -> Promise<{ ok, reading } | { ok: false, error }>          (lib/price.js)
 *   isVisible      () -> boolean
 *   onChange       (feed) -> void, called after anything the page shows changed
 *   now            () -> ms
 *   setInterval / clearInterval
 */
export function createPriceFeed(deps) {
  const {
    storage,
    fetchPrice,
    isVisible,
    onChange = () => {},
    now = Date.now,
    setInterval: every = globalThis.setInterval,
    clearInterval: cancel = globalThis.clearInterval,
  } = deps;

  const feed = {
    /** The switch. False until read, so nothing is fetched before it is known. */
    enabled: false,
    /** True once the switch has been read (or failed to be). */
    loaded: false,
    reading: null,
    live: false,
    attempted: false,
    inFlight: false,
    lastAttempt: 0,
    /** Set when a new reading lands, so the page can fade it in once. */
    landed: false,
    requests: 0,
  };
  let pollTimer = null;
  let repaintTimer = null;

  function changed() {
    onChange(feed);
    feed.landed = false;
  }

  function stopTimers() {
    if (pollTimer !== null) cancel(pollTimer);
    if (repaintTimer !== null) cancel(repaintTimer);
    pollTimer = null;
    repaintTimer = null;
  }

  async function poll() {
    if (!feed.enabled || feed.inFlight || !isVisible()) return;
    feed.inFlight = true;
    feed.lastAttempt = now();
    feed.requests += 1;
    let answer;
    try {
      answer = await fetchPrice();
    } catch (_) {
      answer = { ok: false, error: "relay unreachable" };
    }
    feed.inFlight = false;
    feed.attempted = true;
    if (answer && answer.ok && feed.enabled) {
      feed.reading = answer.reading;
      feed.live = true;
      feed.landed = true;
      try {
        await storage.set({ [LAST_PRICE_KEY]: toStored(answer.reading) });
      } catch (_) {
        /* still shown; only not remembered */
      }
    }
    changed();
  }

  /** In view and switched on: keep the timers running and ask if it is time. */
  function resume() {
    if (!feed.enabled || !isVisible()) {
      stopTimers();
      changed();
      return;
    }
    const t = now();
    const recent = !!feed.reading && t - feed.reading.fetchedAt < MIN_REFETCH_MS;
    if (recent) feed.live = true;
    if (pollTimer === null) pollTimer = every(poll, POLL_MS);
    if (repaintTimer === null) repaintTimer = every(changed, REPAINT_MS);
    changed();
    if (!recent && t - feed.lastAttempt >= MIN_REFETCH_MS) poll();
  }

  /** Reads the switch and the remembered reading, then starts if allowed. */
  async function start() {
    try {
      const stored = await storage.get({ [SHOW_PRICE_KEY]: null, [LAST_PRICE_KEY]: null });
      feed.enabled = priceEnabled(stored[SHOW_PRICE_KEY]);
      feed.reading = feed.enabled ? fromStored(stored[LAST_PRICE_KEY]) : null;
    } catch (_) {
      feed.enabled = false;
      feed.reading = null;
    }
    feed.loaded = true;
    resume();
  }

  /** The page's switch was flipped here. Off: stop at once, show nothing. */
  async function setEnabled(on) {
    applyEnabled(on === true);
    try {
      await storage.set({ [SHOW_PRICE_KEY]: on === true });
    } catch (_) {
      /* the page follows the switch; it is only not remembered */
    }
  }

  function applyEnabled(on) {
    if (on === feed.enabled) return;
    feed.enabled = on;
    if (!on) {
      feed.live = false;
      stopTimers();
      changed();
      return;
    }
    feed.attempted = false;
    resume();
  }

  /**
   * chrome.storage.onChanged, local area: another SWARM Start page flipped the
   * switch or stored a newer reading.
   */
  function storageChanged(changes) {
    if (changes[SHOW_PRICE_KEY]) applyEnabled(priceEnabled(changes[SHOW_PRICE_KEY].newValue));
    if (changes[LAST_PRICE_KEY] && feed.enabled) {
      const r = fromStored(changes[LAST_PRICE_KEY].newValue);
      if (r && (!feed.reading || r.fetchedAt > feed.reading.fetchedAt)) {
        const isNew = !feed.reading || r.fetchedAt !== feed.reading.fetchedAt;
        feed.reading = r;
        if (now() - r.fetchedAt < MIN_REFETCH_MS) feed.live = true;
        if (isNew) changed();
      }
    }
  }

  /** document "visibilitychange". */
  function visibilityChanged() {
    if (!feed.loaded) return;
    resume();
  }

  return Object.assign(feed, { start, setEnabled, storageChanged, visibilityChanged, poll, stop: stopTimers });
}
