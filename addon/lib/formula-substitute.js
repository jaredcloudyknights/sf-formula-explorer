// Substitute the record's current values into a formula string, returning a
// list of segments suitable for safe HTML rendering. The caller composes the
// segments into the popover; nothing in here touches the DOM.
//
// Each segment is one of:
//   { kind: "text",    value: string }     - literal formula fragment
//   { kind: "value",   ref: string, display: string, raw: any }
//   { kind: "missing", ref: string }       - couldn't resolve (FLS, deleted, etc.)
//
// "ref" is the original dot-path as written in the formula (e.g. "Account.Name").
// "display" is the human-formatted value as it should appear in the substituted
// rendering (e.g. "\"Acme Corp\"" for strings, "100" for numbers).

import { extractFieldRefs } from "./formula-parser.js";

const STRING_LITERAL = /"(?:[^"\\]|\\.)*"/g;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const GLOBAL_MERGE = /\$[A-Za-z]+(?:\.[A-Za-z0-9_]+)*/g;
const TOKEN = /([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)(\s*\()?/g;
const RESERVED = new Set(["TRUE", "FALSE", "NULL"]);

// `knownTopLevel` is an optional Set<string> of valid top-level identifiers
// on the object (field names + relationship names). When provided, ref
// candidates whose top-level segment is NOT in the set are emitted as plain
// text instead of "missing" — distinguishing "stray formula token" from
// "field exists but the user can't see its value."
export function substituteFormula(formula, values, knownTopLevel) {
  if (typeof formula !== "string") return [];
  // Build a mask string where positions inside strings/comments/globals are
  // replaced with spaces. We tokenize against the mask but emit slices from
  // the original formula so the rendering keeps literal strings intact.
  let mask = formula
    .replace(BLOCK_COMMENT, (m) => " ".repeat(m.length))
    .replace(STRING_LITERAL, (m) => " ".repeat(m.length))
    .replace(GLOBAL_MERGE, (m) => " ".repeat(m.length));

  const refs = [];
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(mask)) !== null) {
    if (m[2]) continue;
    const ref = m[1];
    if (RESERVED.has(ref.toUpperCase())) continue;
    refs.push({ ref, start: m.index, end: m.index + ref.length });
  }

  const segments = [];
  let cursor = 0;
  for (const { ref, start, end } of refs) {
    if (start > cursor) {
      segments.push({ kind: "text", value: formula.slice(cursor, start) });
    }
    const isKnown = !knownTopLevel || knownTopLevel.has(ref.split(".")[0]);
    if (Object.prototype.hasOwnProperty.call(values, ref) && values[ref] !== undefined) {
      const raw = values[ref];
      segments.push({ kind: "value", ref, raw, display: formatValue(raw) });
    } else if (isKnown) {
      segments.push({ kind: "missing", ref });
    } else {
      // Not a real field on this object — pass through as the original text
      // so the formula reads naturally without false "no access" callouts.
      segments.push({ kind: "text", value: ref });
    }
    cursor = end;
  }
  if (cursor < formula.length) {
    segments.push({ kind: "text", value: formula.slice(cursor) });
  }
  return segments;
}

// Format a raw JSON value for in-formula display.
export function formatValue(raw) {
  if (raw === null) return "BLANK";
  if (raw === true) return "TRUE";
  if (raw === false) return "FALSE";
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "string") {
    // Salesforce returns dates as "2026-05-13" and datetimes as ISO. Render
    // both as quoted strings — they read naturally in a substituted formula.
    return '"' + raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  // Object / array: stringify compactly.
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

// Given a flat record like { Amount: 100, Account: { Name: "Acme" } },
// produce a flat lookup keyed by dot-path. Refs like "Account.Name" can then
// be resolved with a single hash lookup. Refs missing from the record stay
// absent (the substituter will emit a "missing" segment for them).
export function flattenRecord(record, refs) {
  const out = {};
  if (!record || typeof record !== "object") return out;
  for (const ref of refs) {
    const parts = ref.split(".");
    let cur = record;
    let ok = true;
    for (const p of parts) {
      if (cur === null || cur === undefined) {
        ok = false;
        break;
      }
      // Salesforce returns relationship fields verbatim; case match on key.
      if (Object.prototype.hasOwnProperty.call(cur, p)) {
        cur = cur[p];
      } else {
        ok = false;
        break;
      }
    }
    if (ok) out[ref] = cur;
  }
  return out;
}

// Re-export for convenience to callers that want the parsed refs.
export { extractFieldRefs };
