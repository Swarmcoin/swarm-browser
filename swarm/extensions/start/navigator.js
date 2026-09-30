/**
 * The SWARM Navigator: the side panel the toolbar button opens.
 *
 * Every link opens in a new tab so the panel stays where it is. The wallet
 * and SWARM Update are opened as their own popup pages (open.js); this panel
 * does not talk to either extension. No network request.
 */
import { DESTINATIONS } from "./lib/destinations.js";
import { openDestination, openOwnPage, openUpdate, openWallet } from "./open.js";

function icon(id) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  if (id === "i-mark") svg.setAttribute("class", "mark");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `icons.svg#${id}`);
  svg.append(use);
  return svg;
}

const list = document.getElementById("destinations");
for (const d of DESTINATIONS) {
  const li = document.createElement("li");
  const el = d.open === "url" ? document.createElement("a") : document.createElement("button");
  el.className = "nav__item";
  el.dataset.id = d.id;
  if (d.open === "url") {
    el.href = d.url;
    el.target = "_blank";
    el.rel = "noopener";
  } else {
    el.type = "button";
  }
  el.addEventListener("click", (event) => {
    event.preventDefault();
    openDestination(d, { newTab: true });
  });
  const box = document.createElement("span");
  box.className = "tile-ico";
  box.append(icon(d.icon));
  const label = document.createElement("strong");
  label.textContent = d.label;
  const note = document.createElement("small");
  note.textContent = d.note;
  el.append(box, label);
  if (d.badge) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = d.badge;
    el.append(badge);
  }
  el.append(note);
  li.append(el);
  list.append(li);
}

document.getElementById("open-wallet").addEventListener("click", () => openWallet());
document.getElementById("open-update").addEventListener("click", () => openUpdate());
for (const [id, page] of [
  ["link-welcome", "welcome.html"],
  ["link-privacy", "privacy.html"],
]) {
  document.getElementById(id).addEventListener("click", (event) => {
    event.preventDefault();
    openOwnPage(page);
  });
}
