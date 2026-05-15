// Shadow-DOM-piercing DOM utilities. Lightning Web Components render inside
// closed-by-default shadow roots, but content scripts can still read OPEN ones
// (the default for LWC). querySelectorAll on document.body misses them, so we
// walk the tree and descend into every shadowRoot we encounter.

export function querySelectorAllDeep(selector, root = document.body) {
  const out = [];
  walk(root, (node) => {
    if (node.matches && node.matches(selector)) out.push(node);
  });
  return out;
}

export function walk(node, visit) {
  if (!node) return;
  if (node.nodeType !== 1 && node.nodeType !== 11) return; // ELEMENT or DOCUMENT_FRAGMENT
  if (node.nodeType === 1) visit(node);
  if (node.shadowRoot) {
    for (const child of node.shadowRoot.children) walk(child, visit);
  }
  const children = node.children;
  if (children) {
    for (const child of children) walk(child, visit);
  }
}

// Field elements on a Lightning record detail page are tagged with
// data-target-selection-name="sfdc:RecordField.{ObjectApi}.{FieldApi}".
// Returns null when the value is not a record-field selection.
const FIELD_SELECTION_RE = /^sfdc:RecordField\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/;

export function parseFieldSelectionAttr(value) {
  if (!value) return null;
  const m = value.match(FIELD_SELECTION_RE);
  if (!m) return null;
  return { objectApiName: m[1], fieldApiName: m[2] };
}

// Small utility: debounced function. Trailing-call semantics.
export function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
}
