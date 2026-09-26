// Copyright 2026 Swarm. Placeholder service worker.
// Opens the wallet in the side panel when the toolbar icon is clicked with the
// popup suppressed. Replaced by agent B2-wallet.
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
      .catch(() => { /* side panel unavailable in this build */ });
  }
});
