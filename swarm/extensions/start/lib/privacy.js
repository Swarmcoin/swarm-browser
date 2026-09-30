/**
 * The privacy switches SWARM Browser turns on, in plain words.
 *
 * Every entry is compiled into the browser by
 * swarm/patches/swarm/swarm-privacy-defaults.patch; `how` names the mechanism
 * so the list can be checked against that patch line by line. Keep the two in
 * step: a switch listed here that the patch does not set would be a false
 * statement on the person's screen.
 */

export const PRIVACY_SWITCHES = Object.freeze([
  {
    id: "https-first",
    title: "Secure connections first",
    plain: "The browser tries the encrypted (https) version of every site first, and warns you before it opens a page that has none.",
    how: "HTTPS-First mode, on by default. You can turn it off in Settings, Privacy and security.",
  },
  {
    id: "no-pings",
    title: "No link-click reports",
    plain: "Pages cannot use hidden “ping” requests to report which links you click.",
    how: "Startup switch --no-pings.",
  },
  {
    id: "webrtc",
    title: "Your local network stays hidden",
    plain: "Calls and live video in the browser use your public address only, never the addresses inside your home or office network.",
    how: "Startup switch --webrtc-ip-handling-policy=default_public_interface_only.",
  },
  {
    id: "search-engines",
    title: "Sites cannot add search engines",
    plain: "Websites you visit cannot add themselves to your list of search engines.",
    how: "Startup switch --disable-search-engine-collection.",
  },
  {
    id: "referrers",
    title: "No cross-site referrers",
    plain: "When you follow a link to another site, that site is not told which page you came from.",
    how: "Feature NoCrossOriginReferrers, on by default.",
  },
  {
    id: "client-hints",
    title: "No client hints",
    plain: "Websites do not receive the extra details about your device and browser that browsers can send in “client hints”.",
    how: "Feature RemoveClientHints, on by default.",
  },
  {
    id: "system-info",
    title: "Less system detail",
    plain: "Pages learn less about your computer; for example, they are told it has two processor cores whatever it really has.",
    how: "Feature ReducedSystemInfo, on by default.",
  },
]);

/** Not there yet, said as plainly as what is. */
export const NOT_YET = Object.freeze([
  "There is no ad or tracker blocking yet.",
  "There is no phishing or malware warning list.",
]);

export function switchCount() {
  return PRIVACY_SWITCHES.length;
}

/** "7 privacy switches on" (1 -> "1 privacy switch on"). */
export function countLabel(n = switchCount()) {
  return `${n} privacy ${n === 1 ? "switch" : "switches"} on`;
}
