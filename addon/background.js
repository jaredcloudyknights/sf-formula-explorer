// Background service worker.
//
// Responsibilities:
//   - Read the session `sid` cookie from the API host. Cookies are not visible
//     to content scripts, so all auth lives here.
//   - Proxy REST calls to Salesforce: /sobjects/{Object}/describe and
//     /sobjects/{Object}/{id}?fields=... Returns parsed JSON to the caller.
//   - Cache the filtered describe (formula fields only) in
//     chrome.storage.session, keyed by host+object+apiVersion. The cache is
//     RAM-backed and clears on browser restart, which is the right blast
//     radius for an admin-tooling extension.

import { lightningHostToApiHost, parseRecordUrl } from "./content/url-parser.js";
import { activateTab } from "./lib/activate-tab.js";

const API_VERSION = "v66.0";

// On install/update/reload, drop any cached describes so the new code path
// doesn't trip over payloads written by the previous version.
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.clear().catch(() => {});
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "activate") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !parseRecordUrl(tab.url || "")) return;
  try {
    await activateTab(tab.id, { ifDormant: true });
  } catch (err) {
    console.warn("[SFFE] keyboard shortcut:", err.message);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Each handler returns a Promise. We must return true synchronously to keep
  // sendResponse open until the Promise settles.
  handle(msg).then(
    (data) => sendResponse({ ok: true, data }),
    (err) => sendResponse({ ok: false, error: serializeError(err) })
  );
  return true;
});

async function handle(msg) {
  if (!msg || typeof msg.type !== "string") {
    throw new Error("missing message type");
  }
  switch (msg.type) {
    case "describe":
      return describeObject(msg.lightningHost, msg.objectApiName);
    case "fetchRecord":
      return fetchRecord(
        msg.lightningHost,
        msg.objectApiName,
        msg.recordId,
        msg.fields || []
      );
    case "ping":
      return { pong: true, apiVersion: API_VERSION };
    case "sffi:injectContentScript":
      return injectContentScript(msg.tabId);
    default:
      throw new Error(`unknown message type: ${msg.type}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Auth

async function getSessionForHost(lightningHost) {
  const apiHost = lightningHostToApiHost(lightningHost);
  const cookie = await chrome.cookies.get({
    url: `https://${apiHost}`,
    name: "sid",
  });
  if (!cookie || !cookie.value) {
    throw new Error(
      `No Salesforce session cookie on ${apiHost}. Log in to Salesforce in this browser and reload the page.`
    );
  }
  return { sessionId: cookie.value, apiHost };
}

// ──────────────────────────────────────────────────────────────────────────
// REST calls

async function sfFetch(apiHost, sessionId, path) {
  const url = `https://${apiHost}/services/data/${API_VERSION}${path}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${sessionId}`,
    },
    // Don't send cookies — we use the bearer token, and including cookies
    // can trigger CORS preflight needs we don't want.
    credentials: "omit",
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {}
    throw new Error(
      `Salesforce ${res.status} ${res.statusText} for ${path}${detail ? " — " + detail.slice(0, 200) : ""}`
    );
  }
  return res.json();
}

// ──────────────────────────────────────────────────────────────────────────
// Describe (with cache)

async function describeObject(lightningHost, objectApiName) {
  const { sessionId, apiHost } = await getSessionForHost(lightningHost);
  const cacheKey = `describe|${apiHost}|${objectApiName}|${API_VERSION}`;
  const cached = await chrome.storage.session.get(cacheKey);
  if (cached && cached[cacheKey]) {
    return cached[cacheKey];
  }
  const full = await sfFetch(
    apiHost,
    sessionId,
    `/sobjects/${encodeURIComponent(objectApiName)}/describe`
  );
  // Salesforce REST describe returns the formula source as `calculatedFormula`.
  // Older docs/snippets call it `formula` — accept either to be safe.
  const formulaFields = (full.fields || [])
    .filter((f) => {
      const src = f.calculatedFormula ?? f.formula;
      return src != null && src !== "";
    })
    .map((f) => ({
      name: f.name,
      label: f.label,
      formula: f.calculatedFormula ?? f.formula,
      type: f.type,
      calculated: f.calculated === true,
    }));
  // If describe came back with no formula sources but did flag calculated fields,
  // the running user likely lacks the "View Setup and Configuration" permission
  // that exposes formula source via REST. Surface that so the popover can hint.
  const calculatedCount = (full.fields || []).filter((f) => f.calculated === true).length;
  if (formulaFields.length === 0 && calculatedCount > 0) {
    console.warn(
      `[SFFE] ${objectApiName}: describe returned ${calculatedCount} calculated field(s) but no formula source. User probably lacks "View Setup and Configuration" permission.`
    );
  }
  // Collect every real top-level identifier on the object — both field API
  // names and lookup relationship names — so the content script can filter
  // out garbage tokens (picklist labels, stray identifiers) the formula
  // parser may have flagged as field refs. Salesforce 400s a /sobjects
  // fetch as soon as one bad name is in the list, so this filtering must
  // happen before the request.
  const validTopLevel = new Set();
  for (const f of full.fields || []) {
    if (f.name) validTopLevel.add(f.name);
    if (f.relationshipName) validTopLevel.add(f.relationshipName);
  }
  const payload = {
    objectApiName,
    apiVersion: API_VERSION,
    formulaFields,
    validTopLevel: Array.from(validTopLevel),
  };
  await chrome.storage.session.set({ [cacheKey]: payload });
  return payload;
}

// ──────────────────────────────────────────────────────────────────────────
// Record fetch

async function fetchRecord(lightningHost, objectApiName, recordId, fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return {}; // nothing to fetch
  }
  const { sessionId, apiHost } = await getSessionForHost(lightningHost);
  // The REST API accepts `fields=` with comma-separated dot-paths.
  const qs = encodeURIComponent(fields.join(","));
  const path = `/sobjects/${encodeURIComponent(objectApiName)}/${encodeURIComponent(recordId)}?fields=${qs}`;
  return sfFetch(apiHost, sessionId, path);
}

async function injectContentScript(tabId) {
  if (!tabId) throw new Error("missing tab id");
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || tab.url.startsWith("chrome://")) {
    throw new Error("cannot inject into this tab");
  }
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["styles/content.css"],
    });
  } catch {
    // CSS may already be present from a manifest content script.
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/content.js"],
  });
  return { injected: true };
}

function serializeError(err) {
  if (err && typeof err === "object") {
    return { message: err.message || String(err), name: err.name || "Error" };
  }
  return { message: String(err), name: "Error" };
}
