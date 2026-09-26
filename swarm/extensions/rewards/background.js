// Copyright 2026 Swarm. Placeholder service worker: seeds the local ledger.
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get({ optedIn: null });
  if (current.optedIn === null) {
    // Opt-in, never opt-out: rewards stay off until the user turns them on.
    await chrome.storage.local.set({ optedIn: false, ledger: [] });
  }
});
