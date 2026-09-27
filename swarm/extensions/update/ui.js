/**
 * What the popup and update.html have in common: asking the service worker,
 * and turning its answer into sentences.
 *
 * The pages never fetch anything and never decide anything; the worker owns
 * the check, the alarms and the notification, and these helpers only word it.
 * Everything is written with textContent: no string from the feed is ever
 * parsed as HTML.
 */

export const el = (id) => document.getElementById(id);

export function setText(id, value) {
  const node = el(id);
  if (node) node.textContent = value === null || value === undefined ? "" : String(value);
}

export function show(id, visible) {
  const node = el(id);
  if (node) node.classList.toggle("hidden", !visible);
}

/** Asks the service worker. Returns its view of things, or null. */
export async function ask(type) {
  try {
    const answer = await chrome.runtime.sendMessage({ type });
    if (answer && answer.ok && answer.view) return answer.view;
  } catch (_) {
    /* the worker is restarting; the caller shows what it has */
  }
  return null;
}

export function formatWhen(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDay(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/** Bytes as Windows Explorer shows them (1 MB = 1,048,576 bytes). */
export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

/** "153.0.8010.52 · SWARM 1", or what a development copy is. */
export function runningLabel(view) {
  if (!view || !view.running) return "Version unknown";
  if (view.running.channel === "dev") return "Development copy (no real version)";
  return `${view.running.chromium} · SWARM ${view.running.swarm}`;
}

export function buildLabel(build) {
  return `${build.chromium} · SWARM ${build.swarm}`;
}

/** The last part of a download address: the file name people will see. */
export function fileName(url) {
  try {
    const parts = new URL(url).pathname.split("/");
    return decodeURIComponent(parts[parts.length - 1] || "");
  } catch (_) {
    return "";
  }
}

/** One line for the state of things, and one line under it. */
export function describe(view) {
  if (!view) return { headline: "SWARM Update is starting", detail: "Try again in a moment." };
  const error = view.lastCheck && !view.lastCheck.ok ? view.lastCheck.message : "";
  switch (view.headline) {
    case "offer":
      return {
        headline: `SWARM Browser ${view.offer.chromium} is available`,
        detail: "Nothing has been downloaded, and nothing will install itself.",
      };
    case "latest":
      return { headline: "You are on the latest version", detail: "" };
    case "no-target":
      return { headline: "No update is listed for this system yet", detail: "" };
    case "error":
      return { headline: "The last check did not work", detail: error };
    case "unknown-version":
      return { headline: "This browser does not know its own version", detail: "So it cannot tell whether there is a newer one." };
    default:
      return {
        headline: "Not checked yet",
        detail: "The first check runs a few minutes after the browser starts, then once a day.",
      };
  }
}

export function checkedLine(view) {
  if (!view || !view.lastCheck) return "Not checked yet";
  return `Checked ${formatWhen(view.lastCheck.at)}`;
}

/** Copies text, and says so on the button; says what to do if it cannot. */
export async function copy(button, value) {
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = "Copied";
  } catch (_) {
    button.textContent = "Select and copy it";
  }
  setTimeout(() => {
    button.textContent = label;
  }, 1800);
}
