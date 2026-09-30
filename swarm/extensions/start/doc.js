/**
 * The welcome page and the privacy page: the list of switches from
 * lib/privacy.js, and the few buttons that open the wallet, SWARM Update or a
 * settings page. No network request.
 */
import { NOT_YET, PRIVACY_SWITCHES, countLabel } from "./lib/privacy.js";
import { openOwnPage, openSettings, openUpdate, openWallet } from "./open.js";

function svgIcon(id) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `icons.svg#${id}`);
  svg.append(use);
  return svg;
}

function renderSwitches(list, { withHow }) {
  for (const s of PRIVACY_SWITCHES) {
    const li = document.createElement("li");
    li.dataset.id = s.id;
    const title = document.createElement("strong");
    title.textContent = s.title;
    const plain = document.createElement("span");
    plain.textContent = s.plain;
    li.append(svgIcon("i-check"), title, plain);
    if (withHow) {
      const how = document.createElement("span");
      how.className = "how";
      how.textContent = s.how;
      li.append(how);
    }
    list.append(li);
  }
}

for (const list of document.querySelectorAll("[data-switch-list]")) {
  renderSwitches(list, { withHow: list.dataset.switchList === "full" });
}
for (const el of document.querySelectorAll("[data-switch-count]")) el.textContent = countLabel();
for (const list of document.querySelectorAll("[data-not-yet]")) {
  for (const line of NOT_YET) {
    const li = document.createElement("li");
    li.textContent = line;
    list.append(li);
  }
}

const actions = {
  wallet: () => openWallet(),
  update: () => openUpdate(),
  privacy: () => openOwnPage("privacy.html"),
  welcome: () => openOwnPage("welcome.html"),
  "settings-search": () => openSettings("search"),
  "settings-privacy": () => openSettings("privacy"),
  extensions: () => chrome.tabs.create({ url: "chrome://extensions/" }),
};
for (const button of document.querySelectorAll("button[data-action]")) {
  const run = actions[button.dataset.action];
  if (run) button.addEventListener("click", () => run());
}
