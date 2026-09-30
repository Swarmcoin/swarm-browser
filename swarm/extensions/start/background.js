/**
 * SWARM Start, the service worker. One job: make the toolbar button (the
 * SWARM mark) open the SWARM Navigator side panel. It makes no network
 * request and keeps no state.
 */
function panelOnClick() {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
}

chrome.runtime.onInstalled.addListener(panelOnClick);
chrome.runtime.onStartup.addListener(panelOnClick);
panelOnClick();
