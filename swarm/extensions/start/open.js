/**
 * Opening things from the Start page, the Navigator and the welcome page.
 *
 * The bundled SWARM Wallet and SWARM Update offer no messaging to other
 * extensions (their `externally_connectable` does not list SWARM Start), so
 * the Start extension never talks to them. It only opens their own popup page
 * in a small window of its own: chrome.windows.create is a browser-initiated
 * navigation, which Chromium allows to another extension's page without that
 * page being web-accessible (extension_navigation_throttle.cc).
 */
import { isAllowedDestination, updatePopupUrl, walletPopupUrl } from "./lib/destinations.js";

const POPUP = { type: "popup", width: 392, height: 640, focused: true };

function openPopupWindow(url) {
  return chrome.windows.create({ ...POPUP, url }).catch(() => chrome.tabs.create({ url }));
}

export function openWallet() {
  return openPopupWindow(walletPopupUrl());
}

export function openUpdate() {
  return openPopupWindow(updatePopupUrl());
}

/** A page of this extension (welcome.html, privacy.html) in a new tab. */
export function openOwnPage(path) {
  return chrome.tabs.create({ url: chrome.runtime.getURL(path) });
}

/** A browser settings page, e.g. "chrome://settings/search". */
export function openSettings(path) {
  return chrome.tabs.create({ url: `chrome://settings/${path || ""}` });
}

/**
 * A destination from lib/destinations.js. `newTab` for the Navigator (the side
 * panel stays open beside it); the Start page opens in the same tab.
 */
export function openDestination(destination, { newTab = false } = {}) {
  if (destination.open === "wallet") return openWallet();
  if (!isAllowedDestination(destination.url)) return Promise.resolve();
  if (newTab) return chrome.tabs.create({ url: destination.url });
  return chrome.tabs.getCurrent().then((tab) =>
    tab ? chrome.tabs.update(tab.id, { url: destination.url }) : chrome.tabs.create({ url: destination.url }),
  );
}
