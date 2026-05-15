// Defensive tokenizer that extracts field-reference candidates from a
// Salesforce formula string. Not a full parser — see plan section "Formula
// parsing" for the rules and known limitations.
//
// Steps:
//   1. Strip string literals (including escaped quotes).
//   2. Strip block comments.
//   3. Strip $Global merge-field references ($User, $Profile, $Label, etc.).
//   4. Walk identifier-like tokens. Any identifier immediately followed by `(`
//      is treated as a function call (so we don't need a list of ~200 SF
//      functions). Anything else is a field-reference candidate.
//   5. Drop boolean/null literals.
//
// Returns: an array of unique dot-paths in order of first appearance.
// Example: extractFieldRefs("IF(Amount > 0, Account.Name, \"none\")")
//          -> ["Amount", "Account.Name"]

const STRING_LITERAL = /"(?:[^"\\]|\\.)*"/g;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const GLOBAL_MERGE = /\$[A-Za-z]+(?:\.[A-Za-z0-9_]+)*/g;
const TOKEN = /([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)(\s*\()?/g;
const RESERVED = new Set(["TRUE", "FALSE", "NULL"]);

export function extractFieldRefs(formula) {
  if (typeof formula !== "string" || !formula.trim()) return [];

  const stripped = formula
    .replace(BLOCK_COMMENT, " ")
    .replace(STRING_LITERAL, " ")
    .replace(GLOBAL_MERGE, " ");

  const seen = new Set();
  const out = [];
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(stripped)) !== null) {
    if (m[2]) continue; // identifier followed by `(` — function call
    const ref = m[1];
    if (RESERVED.has(ref.toUpperCase())) continue;
    // A bare numeric leading char is impossible here (regex requires [A-Za-z_]).
    if (!seen.has(ref)) {
      seen.add(ref);
      out.push(ref);
    }
  }
  return out;
}

// Returns true if the formula's intent is to render rich content (image, link)
// where substituting raw values into the formula text would be misleading.
const RICH_FORMULA_PREFIX = /^\s*(IMAGE|HYPERLINK)\s*\(/i;

export function isRichFormula(formula) {
  return typeof formula === "string" && RICH_FORMULA_PREFIX.test(formula);
}
