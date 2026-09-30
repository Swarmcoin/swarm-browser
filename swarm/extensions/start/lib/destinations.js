/**
 * Where the Start page's shortcuts and the Navigator lead. One list, so the
 * two can never disagree.
 *
 * `icon` is a symbol id in icons.svg. `open` is "url" (a normal web page) or
 * "wallet" (the bundled SWARM Wallet's own popup page, see open.js).
 *
 * FUEL is left out on purpose: it is a separate brand.
 */

export const WALLET_ID = "gmmgmodmgnigcgboccjelpgedejejfap";
export const UPDATE_ID = "locbhnoahhmjhcjpndjmnfmnfekhdode";

export const DESTINATIONS = Object.freeze([
  { id: "site", label: "swarm.green", note: "SWARM's home", icon: "i-mark", open: "url", url: "https://swarm.green/" },
  {
    id: "explorer",
    label: "Explorer",
    note: "SWARM mainnet blocks and transactions",
    icon: "i-explorer",
    open: "url",
    url: "https://mainnet.explore.swarm.green/",
  },
  { id: "wallet", label: "Wallet", note: "Your SWARM Wallet on SWARM mainnet", icon: "i-wallet", open: "wallet" },
  {
    id: "messenger",
    label: "Messenger",
    note: "Private messages and calls",
    icon: "i-message",
    open: "url",
    url: "https://swarm.green/ecosystem/messenger",
  },
  {
    id: "mining",
    label: "Node and mining",
    note: "Run a node, mine SWM",
    icon: "i-mining",
    open: "url",
    url: "https://swarm.green/mining",
  },
  {
    id: "market",
    label: "Market",
    badge: "testnet",
    note: "The SWARM marketplace, on the SWARM testnet",
    icon: "i-market",
    open: "url",
    url: "https://swarm-market.vercel.app",
  },
  { id: "support", label: "Support", note: "Help and questions", icon: "i-support", open: "url", url: "https://swarm.green/support" },
]);

export const BROWSER_PAGE_URL = "https://swarm.green/ecosystem/browser";

/** Only https addresses on these hosts are ever opened from the list. */
const ALLOWED_HOSTS = new Set(["swarm.green", "mainnet.explore.swarm.green", "swarm-market.vercel.app"]);

export function isAllowedDestination(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOSTS.has(u.hostname);
  } catch (_) {
    return false;
  }
}

/** The bundled wallet's popup page, opened as its own small window. */
export function walletPopupUrl() {
  return `chrome-extension://${WALLET_ID}/popup.html`;
}

/** SWARM Update's popup page, opened the same way. */
export function updatePopupUrl() {
  return `chrome-extension://${UPDATE_ID}/popup.html`;
}
