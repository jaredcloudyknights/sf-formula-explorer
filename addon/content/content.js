// Content script entry point. MV3 content scripts can't statically `import`,
// so we resolve our modules via chrome.runtime.getURL + dynamic import. The
// imported files are listed in manifest.json's web_accessible_resources.

if (globalThis.__SFFE_CS_INIT__) {
  // Programmatic re-inject (SPA fallback) — the first instance handles messages.
} else {
  globalThis.__SFFE_CS_INIT__ = true;
  bootstrap();
}

function bootstrap() {
// Register the activation listener immediately so popup/shortcut messages
// aren't lost while dynamic imports are still loading.
const activationQueue = [];
let dispatchActivation = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "sffi:activate") {
    if (!dispatchActivation) {
      activationQueue.push(msg);
      sendResponse({ ok: true, queued: true });
      return;
    }
    dispatchActivation(msg);
    sendResponse({ ok: true });
    return;
  }
  return false;
});

// Activation model:
//   - On load, the script registers a message listener and reads the
//     `alwaysOn` setting from chrome.storage.sync.
//   - If alwaysOn is true: activate immediately (start observers, run
//     discovery on the current record).
//   - Otherwise: stay dormant until the popup sends a `sffi:activate`
//     message, then activate.
//   - Toggling alwaysOn on later in the same session activates the page.
//     Toggling off does not tear down the existing session — icons remain
//     functional until the next page reload. (Documented in README.)

(async () => {
  const base = (p) => chrome.runtime.getURL(p);
  const [urlParser, walker, iconMod, popoverMod, api, fparser, fsubst] =
    await Promise.all([
      import(base("content/url-parser.js")),
      import(base("content/dom-walker.js")),
      import(base("content/icon.js")),
      import(base("content/popover.js")),
      import(base("lib/api.js")),
      import(base("lib/formula-parser.js")),
      import(base("lib/formula-substitute.js")),
    ]);

  const { parseRecordUrl } = urlParser;
  const { querySelectorAllDeep, walk, parseFieldSelectionAttr, debounce } = walker;
  const { createIcon, promoteToReady, removeIcon } = iconMod;
  const { openPopover, closePopover } = popoverMod;
  const { describeObject, fetchRecord } = api;
  const { extractFieldRefs, isRichFormula } = fparser;
  const { substituteFormula, flattenRecord } = fsubst;

  const STATE = {
    activated: false,
    lightningHost: window.location.hostname,
    objectApiName: null,
    recordId: null,
    formulaFields: new Map(),
    // Set of valid top-level identifiers (field names + relationship names)
    // on the current object. Used to reject ref candidates the formula
    // tokenizer turns up but that don't actually exist on the object.
    validTopLevel: new Set(),
    describePromise: null,
    generation: 0,
    observer: null,
  };

  log("loaded (dormant)");

  dispatchActivation = (msg) => {
    if (msg.ifDormant && STATE.activated) return;
    activate(msg.ifDormant ? "keyboard shortcut" : "popup click");
  };
  for (const msg of activationQueue) dispatchActivation(msg);
  activationQueue.length = 0;

  // React to setting changes mid-session.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.alwaysOn && changes.alwaysOn.newValue === true && !STATE.activated) {
      activate("alwaysOn enabled");
    }
  });

  // Check the persisted preference. If always-on, kick off now.
  try {
    const { alwaysOn = false } = await chrome.storage.sync.get(["alwaysOn"]);
    if (alwaysOn) activate("alwaysOn at startup");
  } catch (err) {
    log("storage read failed:", err.message);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Activation

  function activate(reason) {
    if (STATE.activated) {
      // Re-run discovery on the current record in case the popup was clicked
      // after the page changed shape.
      log(`activate (${reason}) — already active; re-running discovery`);
      handleUrlChange();
      discoverAndInjectIcons();
      return;
    }
    STATE.activated = true;
    log(`activate (${reason})`);
    watchUrlChanges(handleUrlChange);
    STATE.observer = new MutationObserver(
      debounce(() => discoverAndInjectIcons(), 200)
    );
    STATE.observer.observe(document.body, { subtree: true, childList: true });
    handleUrlChange();
  }

  // ────────────────────────────────────────────────────────────────────────
  // URL handling

  function handleUrlChange() {
    const parsed = parseRecordUrl(window.location.href);
    if (!parsed) {
      teardownRecord();
      return;
    }
    if (
      parsed.objectApiName === STATE.objectApiName &&
      parsed.recordId === STATE.recordId
    ) {
      return;
    }
    teardownRecord();
    STATE.objectApiName = parsed.objectApiName;
    STATE.recordId = parsed.recordId;
    STATE.generation += 1;
    log(`record changed -> ${STATE.objectApiName}/${STATE.recordId}`);
    loadDescribe(STATE.generation);
    // Don't wait for describe — inject pending icons as soon as fields exist.
    discoverAndInjectIcons();
  }

  function teardownRecord() {
    closePopover();
    walk(document.body, (el) => {
      if (el.hasAttribute && el.hasAttribute("data-sffi-injected")) {
        el.removeAttribute("data-sffi-injected");
        el.removeAttribute("data-sffi-field");
        el.removeAttribute("data-sffi-object");
      }
    });
    document
      .querySelectorAll(".sffi-icon, .sffi-icon--pending")
      .forEach((n) => removeIcon(n));
    STATE.objectApiName = null;
    STATE.recordId = null;
    STATE.formulaFields = new Map();
    STATE.describePromise = null;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Describe + icon injection

  async function loadDescribe(gen) {
    if (!STATE.objectApiName) return;
    if (STATE.describePromise) return STATE.describePromise;

    STATE.describePromise = (async () => {
      try {
        const describe = await describeObject(
          STATE.lightningHost,
          STATE.objectApiName
        );
        if (gen !== STATE.generation) return;
        const map = new Map();
        for (const f of describe.formulaFields) map.set(f.name, f);
        STATE.formulaFields = map;
        STATE.validTopLevel = new Set(describe.validTopLevel || []);
        log(
          `describe: ${describe.formulaFields.length} formula field(s) on ${STATE.objectApiName}`
        );
        discoverAndInjectIcons();
      } catch (err) {
        log("describe failed:", err.message);
        document.querySelectorAll(".sffi-icon--pending").forEach((el) => {
          el.classList.remove("sffi-icon--pending");
          el.classList.add("sffi-icon--error");
          el.title = `Error: ${err.message}`;
        });
      } finally {
        STATE.describePromise = null;
      }
    })();

    return STATE.describePromise;
  }

  async function waitForDescribe() {
    if (STATE.describePromise) await STATE.describePromise;
  }

  function discoverAndInjectIcons() {
    if (!STATE.objectApiName) return;
    const candidates = querySelectorAllDeep(
      '[data-target-selection-name^="sfdc:RecordField."]'
    );
    for (const el of candidates) {
      if (el.hasAttribute("data-sffi-injected")) continue;
      const parsed = parseFieldSelectionAttr(
        el.getAttribute("data-target-selection-name")
      );
      if (!parsed) continue;
      if (parsed.objectApiName !== STATE.objectApiName) continue;

      if (STATE.formulaFields.has(parsed.fieldApiName)) {
        injectIcon(el, parsed, false);
      } else if (STATE.describePromise) {
        injectIcon(el, parsed, true);
      }
    }

    if (STATE.formulaFields.size > 0) {
      document.querySelectorAll(".sffi-icon--pending").forEach((iconEl) => {
        const host = iconEl.closest("[data-sffi-injected]");
        if (!host) return;
        const field = host.getAttribute("data-sffi-field");
        if (STATE.formulaFields.has(field)) {
          const meta = STATE.formulaFields.get(field);
          promoteToReady(iconEl, `Explore formula: ${meta.label || field}`);
        } else {
          host.removeAttribute("data-sffi-injected");
          host.removeAttribute("data-sffi-field");
          host.removeAttribute("data-sffi-object");
          removeIcon(iconEl);
        }
      });
    }
  }

  function injectIcon(hostEl, { objectApiName, fieldApiName }, pending) {
    const meta = STATE.formulaFields.get(fieldApiName);
    const title = meta
      ? `Explore formula: ${meta.label || fieldApiName}`
      : "Exploring formula…";
    const icon = createIcon({ pending, title });
    icon.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onIconClick(icon, hostEl, fieldApiName);
    });
    hostEl.appendChild(icon);
    hostEl.setAttribute("data-sffi-injected", "true");
    hostEl.setAttribute("data-sffi-field", fieldApiName);
    hostEl.setAttribute("data-sffi-object", objectApiName);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Icon click

  async function onIconClick(iconEl, hostEl, fieldApiName) {
    try {
      await waitForDescribe();
    } catch {
      // loadDescribe logs and marks pending icons as error
    }
    const meta = STATE.formulaFields.get(fieldApiName);
    if (!meta) {
      openPopover({
        anchor: iconEl,
        title: fieldApiName,
        errorMessage: "This field is not a formula field.",
      });
      return;
    }
    const subtitle = `${STATE.objectApiName}.${fieldApiName}`;
    const rich = isRichFormula(meta.formula);
    const allRefs = rich ? [] : extractFieldRefs(meta.formula);
    // Drop ref candidates whose top-level segment isn't on this object's
    // describe. They're almost always picklist values or stray tokens the
    // tokenizer can't distinguish from real refs without the describe.
    // Salesforce returns a 400 for the whole record-fetch as soon as one
    // unknown name is in the fields= list, so this filtering is required.
    const refs = STATE.validTopLevel.size > 0
      ? allRefs.filter((r) => STATE.validTopLevel.has(r.split(".")[0]))
      : allRefs;
    const droppedRefs = allRefs.filter((r) => !refs.includes(r));
    if (droppedRefs.length > 0) {
      log(`dropping non-field tokens from ${fieldApiName}:`, droppedRefs.join(", "));
    }

    openPopover({
      anchor: iconEl,
      title: meta.label || fieldApiName,
      subtitle,
      formula: meta.formula,
      segments: rich ? null : [{ kind: "text", value: "Loading values…" }],
      sourceOnly: rich,
    });

    if (rich) return;

    const fieldsToFetch = unique([...refs, fieldApiName]);
    const gen = STATE.generation;
    try {
      const record = await fetchRecord(
        STATE.lightningHost,
        STATE.objectApiName,
        STATE.recordId,
        fieldsToFetch
      );
      if (gen !== STATE.generation) return;
      const valueMap = flattenRecord(record, refs);
      const segments = substituteFormula(meta.formula, valueMap, STATE.validTopLevel);
      const currentValue = record[fieldApiName];
      openPopover({
        anchor: iconEl,
        title: meta.label || fieldApiName,
        subtitle,
        formula: meta.formula,
        segments,
        currentValue: currentValue === undefined ? null : currentValue,
      });
    } catch (err) {
      if (gen !== STATE.generation) return;
      openPopover({
        anchor: iconEl,
        title: meta.label || fieldApiName,
        subtitle,
        formula: meta.formula,
        errorMessage: err.message,
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Utilities

  function unique(arr) {
    return Array.from(new Set(arr));
  }

  function watchUrlChanges(callback) {
    let lastHref = window.location.href;
    const fire = () => {
      if (window.location.href !== lastHref) {
        lastHref = window.location.href;
        callback();
      }
    };
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args) {
      const r = origPush.apply(this, args);
      fire();
      return r;
    };
    history.replaceState = function (...args) {
      const r = origReplace.apply(this, args);
      fire();
      return r;
    };
    window.addEventListener("popstate", fire);
    window.addEventListener("hashchange", fire);
  }

  function log(...args) {
    // eslint-disable-next-line no-console
    console.log("[SFFE]", ...args);
  }
})();
}
