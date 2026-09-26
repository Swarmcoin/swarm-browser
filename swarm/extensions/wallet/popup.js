// Copyright 2026 Swarm. Placeholder popup logic.
// Agent B2-wallet replaces this file; the folder path swarm/extensions/wallet
// and the extension id (fixed by "key" in manifest.json) must not change.

const HOST_NAME = 'green.swarm.wallet_host';

const el = (id) => document.getElementById(id);

let revealed = false;

el('reveal').addEventListener('click', () => {
  revealed = !revealed;
  el('reveal').textContent = revealed ? 'Hide' : 'Reveal';
  el('balance').textContent = revealed ? '0.00 SWM' : '⬢⬢⬢.⬢⬢ SWM';
});

// The host is not installed in this scaffold build; probe it so the popup shows
// an honest state instead of pretending to have a balance.
async function probeHost() {
  try {
    const reply = await chrome.runtime.sendNativeMessage(HOST_NAME, { cmd: 'ping' });
    if (reply && reply.ok) {
      el('dot').classList.add('live');
      el('status').textContent = 'Wallet host connected';
      el('receive').disabled = false;
      el('send').disabled = false;
      return;
    }
    el('status').textContent = 'Wallet host replied but is not ready';
  } catch (err) {
    el('status').textContent = 'Wallet host not installed';
  }
}

probeHost();
