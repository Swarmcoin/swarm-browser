// Copyright 2026 Swarm. Placeholder rewards logic: local state only, no network.
const el = (id) => document.getElementById(id);

chrome.storage.local.get({ optedIn: false }).then(({ optedIn }) => {
  el('optin').checked = optedIn;
  el('link').disabled = !optedIn;
});

el('optin').addEventListener('change', async (event) => {
  const optedIn = event.target.checked;
  await chrome.storage.local.set({ optedIn });
  el('link').disabled = !optedIn;
});
