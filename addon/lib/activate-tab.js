// Send activation to a tab's content script, retrying while the script boots.
// If the script was never injected (common after Lightning SPA navigation),
// ask the service worker to inject it programmatically.

export async function activateTab(tabId, { ifDormant = false } = {}) {
  const msg = { type: "sffi:activate", ifDormant };
  const delays = [0, 100, 300, 600];
  let lastErr;
  for (const ms of delays) {
    if (ms) await new Promise((r) => setTimeout(r, ms));
    try {
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch (err) {
      lastErr = err;
    }
  }

  const injected = await chrome.runtime.sendMessage({
    type: "sffi:injectContentScript",
    tabId,
  });
  if (!injected?.ok) {
    throw lastErr;
  }

  const postInjectDelays = [150, 400, 800];
  for (const ms of postInjectDelays) {
    await new Promise((r) => setTimeout(r, ms));
    try {
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
