// Thin content-side wrapper around chrome.runtime.sendMessage to the service
// worker. Adds two niceties:
//   - All calls take an optional `tag`; the caller passes the recordId in
//     flight and discards responses whose tag no longer matches the current
//     page state. Guards against SPA-nav races.
//   - Errors from the service worker are re-thrown so callers can use
//     try/catch instead of inspecting message envelopes.

export async function sendMessage(msg) {
  // chrome.runtime.sendMessage returns a Promise in MV3.
  const response = await chrome.runtime.sendMessage(msg);
  if (!response) {
    throw new Error("No response from service worker (it may have terminated)");
  }
  if (!response.ok) {
    const err = new Error(response.error?.message || "Service worker error");
    err.name = response.error?.name || "ServiceWorkerError";
    throw err;
  }
  return response.data;
}

export function describeObject(lightningHost, objectApiName) {
  return sendMessage({ type: "describe", lightningHost, objectApiName });
}

export function fetchRecord(lightningHost, objectApiName, recordId, fields) {
  return sendMessage({
    type: "fetchRecord",
    lightningHost,
    objectApiName,
    recordId,
    fields,
  });
}
