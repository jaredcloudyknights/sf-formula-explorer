import { activateTab } from "../lib/activate-tab.js";
import { isRecordPageUrl } from "../lib/record-page.js";

// Toolbar popup. Two controls:
//   1. "Explore formulas on this page" - one-shot activation for the current
//      tab. Sends a message to the content script.
//   2. "Always on" toggle - persisted to chrome.storage.sync. When enabled,
//      content scripts auto-activate on every record page on load.
//
// We disable the activate button on tabs that don't match a Lightning record
// URL, so the user can't fire it where it won't do anything.

const activateBtn = document.getElementById("activate");
const alwaysOnBox = document.getElementById("alwaysOn");
const statusEl = document.getElementById("status");

init();

async function init() {
  // Wire the always-on checkbox to storage.
  const { alwaysOn = false } = await chrome.storage.sync.get(["alwaysOn"]);
  alwaysOnBox.checked = alwaysOn;
  alwaysOnBox.addEventListener("change", async () => {
    await chrome.storage.sync.set({ alwaysOn: alwaysOnBox.checked });
    if (alwaysOnBox.checked) {
      // Activate the current tab right away so the user sees an effect.
      const tab = await getActiveTab();
      if (tab && isRecordPageUrl(tab.url)) {
        await sendActivate(tab.id);
      }
    }
  });

  // Wire the one-shot activate button.
  const tab = await getActiveTab();
  if (tab && isRecordPageUrl(tab.url)) {
    activateBtn.disabled = false;
    activateBtn.addEventListener("click", async () => {
      const currentTab = await getActiveTab();
      if (!currentTab?.id || !isRecordPageUrl(currentTab.url)) {
        setStatus("Open a Salesforce Lightning record page to use Formula Explorer.");
        return;
      }
      try {
        await sendActivate(currentTab.id);
        setStatus("Exploring...");
        window.close();
      } catch (err) {
        setStatus(`Couldn't reach the page (${err.message}). Try reloading.`);
      }
    });
  } else {
    setStatus("Open a Salesforce Lightning record page to use Formula Explorer.");
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function sendActivate(tabId) {
  return activateTab(tabId);
}

function setStatus(text) {
  statusEl.textContent = text;
}
