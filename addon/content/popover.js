// Inline popover that shows a formula's source plus the same formula with
// current values substituted. Single instance per page; subsequent opens
// replace the contents in place. Root element gets `all: initial` to firewall
// against Salesforce's global CSS — see styles/content.css.

let rootEl = null;
let dismissCleanup = null;

export function openPopover({ anchor, title, subtitle, formula, segments, currentValue, errorMessage, sourceOnly }) {
  closePopover(); // discard any previous
  rootEl = buildRoot();
  rootEl.appendChild(buildHeader(title, subtitle));
  // The scrollable middle. Header and result stay pinned (flex-shrink:0 in CSS).
  const body = document.createElement("div");
  body.className = "sffi-popover__body";
  if (errorMessage) {
    body.appendChild(buildSection("ERROR", buildErrorBlock(errorMessage)));
  } else {
    body.appendChild(buildSection("FORMULA", buildCodeBlock(formula)));
    if (!sourceOnly) {
      body.appendChild(buildSection("WITH VALUES SUBSTITUTED", buildSegmentBlock(segments)));
    } else {
      body.appendChild(
        buildSection("WITH VALUES SUBSTITUTED", buildNoteBlock(
          "Source-only — IMAGE() and HYPERLINK() formulas aren't displayed with substituted values."
        ))
      );
    }
  }
  rootEl.appendChild(body);
  if (!errorMessage && currentValue !== undefined) {
    rootEl.appendChild(buildResultLine(currentValue));
  }
  document.body.appendChild(rootEl);
  position(rootEl, anchor);
  dismissCleanup = installDismissHandlers();
  return rootEl;
}

export function closePopover() {
  if (dismissCleanup) {
    dismissCleanup();
    dismissCleanup = null;
  }
  if (rootEl && rootEl.parentNode) {
    rootEl.parentNode.removeChild(rootEl);
  }
  rootEl = null;
}

// ──────────────────────────────────────────────────────────────────────────
// Builders

function buildRoot() {
  const div = document.createElement("div");
  div.className = "sffi-popover";
  div.setAttribute("role", "dialog");
  div.setAttribute("aria-label", "Salesforce formula explorer");
  return div;
}

function buildHeader(title, subtitle) {
  const head = document.createElement("div");
  head.className = "sffi-popover__header";
  const t = document.createElement("div");
  t.className = "sffi-popover__title";
  t.textContent = title || "Formula";
  head.appendChild(t);
  if (subtitle) {
    const s = document.createElement("div");
    s.className = "sffi-popover__subtitle";
    s.textContent = subtitle;
    head.appendChild(s);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.className = "sffi-popover__close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";
  close.addEventListener("click", () => closePopover());
  head.appendChild(close);
  return head;
}

function buildSection(label, body) {
  const wrap = document.createElement("div");
  wrap.className = "sffi-popover__section";
  const h = document.createElement("div");
  h.className = "sffi-popover__sectionLabel";
  h.textContent = label;
  wrap.appendChild(h);
  wrap.appendChild(body);
  return wrap;
}

function buildCodeBlock(text) {
  const pre = document.createElement("pre");
  pre.className = "sffi-popover__code";
  pre.textContent = text == null ? "" : String(text);
  return pre;
}

function buildSegmentBlock(segments) {
  const pre = document.createElement("pre");
  pre.className = "sffi-popover__code";
  if (!segments || segments.length === 0) {
    pre.textContent = "(empty)";
    return pre;
  }
  for (const seg of segments) {
    if (seg.kind === "text") {
      pre.appendChild(document.createTextNode(seg.value));
    } else if (seg.kind === "value") {
      const span = document.createElement("span");
      span.className = "sffi-popover__value";
      span.title = `${seg.ref} = ${seg.display}`;
      span.textContent = seg.display;
      pre.appendChild(span);
    } else if (seg.kind === "missing") {
      const span = document.createElement("span");
      span.className = "sffi-popover__missing";
      span.title = "Field is not visible to your profile or could not be retrieved.";
      span.textContent = `<no access: ${seg.ref}>`;
      pre.appendChild(span);
    }
  }
  return pre;
}

function buildResultLine(currentValue) {
  const wrap = document.createElement("div");
  wrap.className = "sffi-popover__result";
  const label = document.createElement("span");
  label.className = "sffi-popover__resultLabel";
  label.textContent = "Result: ";
  const val = document.createElement("span");
  val.className = "sffi-popover__resultValue";
  val.textContent = currentValue == null ? "(blank)" : String(currentValue);
  wrap.appendChild(label);
  wrap.appendChild(val);
  return wrap;
}

function buildErrorBlock(msg) {
  const div = document.createElement("div");
  div.className = "sffi-popover__error";
  div.textContent = msg;
  return div;
}

function buildNoteBlock(msg) {
  const div = document.createElement("div");
  div.className = "sffi-popover__note";
  div.textContent = msg;
  return div;
}

// ──────────────────────────────────────────────────────────────────────────
// Positioning + dismiss

function position(el, anchor) {
  if (!anchor || !anchor.getBoundingClientRect) {
    el.style.top = "60px";
    el.style.left = "60px";
    return;
  }
  const rect = anchor.getBoundingClientRect();
  // Render hidden first so we can measure. The CSS caps height to
  // calc(100vh - 24px), so offsetHeight here is already viewport-bounded.
  el.style.visibility = "hidden";
  el.style.top = "0";
  el.style.left = "0";
  const pw = el.offsetWidth;
  const ph = el.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const MARGIN = 8;

  let topViewport = rect.bottom + 6;
  let leftViewport = rect.left;

  // Flip above when there's no room below but there is room above.
  const roomBelow = vh - rect.bottom - 12;
  const roomAbove = rect.top - 12;
  if (ph > roomBelow && roomAbove > roomBelow) {
    topViewport = rect.top - ph - 6;
  }

  // Clamp into the viewport so a tall popover with a near-bottom anchor still
  // fits — the inner __body will scroll to show overflow content.
  topViewport = Math.max(MARGIN, Math.min(topViewport, vh - ph - MARGIN));
  leftViewport = Math.max(MARGIN, Math.min(leftViewport, vw - pw - MARGIN));

  el.style.top = `${topViewport + window.scrollY}px`;
  el.style.left = `${leftViewport + window.scrollX}px`;
  el.style.visibility = "visible";
}

const SCROLL_DISMISS_GRACE_MS = 400;

function installDismissHandlers() {
  const openedAt = Date.now();
  const onClick = (e) => {
    if (!rootEl) return;
    if (rootEl.contains(e.target)) return;
    // Clicking the icon that opened the popover triggers a re-open in the
    // caller, so closing here is fine — the caller's click handler runs after.
    closePopover();
  };
  const onKey = (e) => {
    if (e.key === "Escape") closePopover();
  };
  const onScroll = (e) => {
    // Lightning often scrolls slightly on first paint; ignore that window.
    if (Date.now() - openedAt < SCROLL_DISMISS_GRACE_MS) return;
    // Ignore scrolls inside the popover (its own scrollable body) — only
    // close when the surrounding page scrolls, since the anchor moves.
    if (rootEl && e.target && rootEl.contains(e.target)) return;
    closePopover();
  };

  // capture: true so we see clicks even inside Salesforce's stopPropagation traps.
  document.addEventListener("mousedown", onClick, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });

  return () => {
    document.removeEventListener("mousedown", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", onScroll, { passive: true, capture: true });
  };
}
