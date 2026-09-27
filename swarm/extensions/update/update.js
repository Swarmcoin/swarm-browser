/**
 * update.html: the version, the download links, the SHA-256 to compare, and
 * "Remind me tomorrow".
 *
 * The links and hashes come from a feed whose signature the service worker
 * has already checked, and lib/state.js re-checks the stored copy against the
 * feed rules (https, allowed hosts, 64 hex digits) before it reaches this
 * page. Clicking a link is an ordinary download the person chose; this page
 * starts nothing by itself.
 */

import {
  ask,
  buildLabel,
  checkedLine,
  copy,
  describe,
  el,
  fileName,
  formatDay,
  formatSize,
  formatWhen,
  runningLabel,
  setText,
  show,
} from "./ui.js";

let current = null;

function say(message, kind) {
  const node = el("message");
  if (!node) return;
  node.textContent = message || "";
  node.className = message ? (kind === "ok" ? "ok" : "error") : "hidden";
}

function link(id, url, label) {
  const node = el(id);
  if (!node) return;
  node.href = url;
  node.textContent = label;
  node.title = url;
}

function paint(view) {
  current = view;
  const words = describe(view);
  setText("headline", words.headline);
  setText("detail", words.detail);
  show("detail", Boolean(words.detail));
  setText("running", runningLabel(view));
  setText("checked", checkedLine(view));

  const channel = el("channel");
  if (channel) {
    const dev = Boolean(view && view.channel === "dev");
    channel.textContent = dev ? "dev" : "";
    channel.classList.toggle("hidden", !dev);
  }

  const offer = view && view.offer;
  show("offer", Boolean(offer));
  show("check-section", !offer);
  if (!offer) return;

  setText("offer-version", buildLabel(offer));
  setText("offer-published", `Published ${formatDay(offer.published)}`);

  link("installer-link", offer.installer.url, `Download ${fileName(offer.installer.url) || "the installer"}`);
  setText("installer-size", formatSize(offer.installer.size));
  setText("installer-sha", offer.installer.sha256);

  link("portable-link", offer.portable.url, `Download ${fileName(offer.portable.url) || "the portable version"}`);
  setText("portable-size", formatSize(offer.portable.size));
  setText("portable-sha", offer.portable.sha256);

  link("notes-link", offer.notes, "What is new in this version");

  show("snoozed", Boolean(view.snoozedUntil));
  setText("snoozed", view.snoozedUntil ? `We will remind you ${formatWhen(view.snoozedUntil)}.` : "");
  el("snooze").disabled = Boolean(view.snoozedUntil);
}

async function refresh() {
  paint(await ask("swarm.update.view"));
}

async function checkNow(button) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Checking…";
  say("");
  const view = await ask("swarm.update.check");
  button.disabled = false;
  button.textContent = label;
  if (!view) {
    say("SWARM Update did not answer. Try again in a moment.");
    return;
  }
  paint(view);
}

async function snooze() {
  const view = await ask("swarm.update.snooze");
  if (view) {
    paint(view);
    say("Fine. Nothing more today; you will be reminded tomorrow.", "ok");
  }
}

el("snooze").addEventListener("click", snooze);
el("check").addEventListener("click", (event) => checkNow(event.currentTarget));
el("check-plain").addEventListener("click", (event) => checkNow(event.currentTarget));
el("copy-installer").addEventListener("click", (event) => {
  if (current && current.offer) copy(event.currentTarget, current.offer.installer.sha256);
});
el("copy-portable").addEventListener("click", (event) => {
  if (current && current.offer) copy(event.currentTarget, current.offer.portable.sha256);
});

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") refresh();
});

refresh();
