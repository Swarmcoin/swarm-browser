/**
 * The toolbar popup: "You are on the latest version" / "Checked <time>" / the
 * offer. Everything it shows comes from the service worker; the only things
 * it can do are ask for a check, snooze an offer, and open update.html.
 */

import {
  ask,
  buildLabel,
  checkedLine,
  describe,
  el,
  formatDay,
  formatWhen,
  runningLabel,
  setText,
  show,
} from "./ui.js";

function say(message, kind) {
  const node = el("message");
  if (!node) return;
  node.textContent = message || "";
  node.className = message ? (kind === "ok" ? "ok" : "error") : "hidden";
}

function paint(view) {
  const words = describe(view);
  setText("running", runningLabel(view));
  setText("headline", words.headline);
  setText("detail", words.detail);
  setText("checked", checkedLine(view));
  show("detail", Boolean(words.detail));

  const channel = el("channel");
  if (channel) {
    const dev = Boolean(view && view.channel === "dev");
    channel.textContent = dev ? "dev" : "";
    channel.classList.toggle("hidden", !dev);
  }

  const offer = view && view.offer;
  show("offer", Boolean(offer));
  if (offer) {
    setText("offer-version", buildLabel(offer));
    setText("offer-published", `Published ${formatDay(offer.published)}`);
    show("snoozed", Boolean(view.snoozedUntil));
    setText("snoozed", view.snoozedUntil ? `We will remind you ${formatWhen(view.snoozedUntil)}.` : "");
    el("snooze").disabled = Boolean(view.snoozedUntil);
  }
}

async function refresh() {
  paint(await ask("swarm.update.view"));
}

async function checkNow() {
  const button = el("check");
  button.disabled = true;
  button.textContent = "Checking…";
  say("");
  const view = await ask("swarm.update.check");
  button.disabled = false;
  button.textContent = "Check now";
  if (!view) {
    say("SWARM Update did not answer. Try again in a moment.");
    return;
  }
  paint(view);
}

async function snooze() {
  const view = await ask("swarm.update.snooze");
  if (view) paint(view);
}

function openPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL("update.html") });
  window.close();
}

el("check").addEventListener("click", checkNow);
el("snooze").addEventListener("click", snooze);
el("show").addEventListener("click", openPage);
el("details").addEventListener("click", openPage);

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") refresh();
});

refresh();
