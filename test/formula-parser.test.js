import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractFieldRefs,
  isRichFormula,
} from "../addon/lib/formula-parser.js";

test("extractFieldRefs: simple arithmetic", () => {
  assert.deepEqual(
    extractFieldRefs("Amount * Quantity__c"),
    ["Amount", "Quantity__c"]
  );
});

test("extractFieldRefs: cross-object dot path", () => {
  assert.deepEqual(
    extractFieldRefs("Account.AnnualRevenue * Discount__c"),
    ["Account.AnnualRevenue", "Discount__c"]
  );
});

test("extractFieldRefs: function calls are not refs", () => {
  // IF, TEXT, YEAR are functions; the inner identifiers are refs.
  assert.deepEqual(
    extractFieldRefs("IF(Amount > 0, TEXT(YEAR(CloseDate)), \"none\")"),
    ["Amount", "CloseDate"]
  );
});

test("extractFieldRefs: string literal containing a field-like name is ignored", () => {
  // "Amount" inside the string is not a real reference, only Name is.
  assert.deepEqual(
    extractFieldRefs('IF(Name = "Amount", 1, 0)'),
    ["Name"]
  );
});

test("extractFieldRefs: literals TRUE/FALSE/NULL are dropped", () => {
  assert.deepEqual(
    extractFieldRefs("IF(IsActive__c = TRUE, NULL, FALSE)"),
    ["IsActive__c"]
  );
});

test("extractFieldRefs: $User and $Profile globals are dropped", () => {
  assert.deepEqual(
    extractFieldRefs("IF($User.Id = OwnerId, $Profile.Name, Name)"),
    ["OwnerId", "Name"]
  );
});

test("extractFieldRefs: deduplicates while preserving first-occurrence order", () => {
  assert.deepEqual(
    extractFieldRefs("Amount + Amount + Quantity__c + Amount"),
    ["Amount", "Quantity__c"]
  );
});

test("extractFieldRefs: empty / blank / non-string returns []", () => {
  assert.deepEqual(extractFieldRefs(""), []);
  assert.deepEqual(extractFieldRefs("   "), []);
  assert.deepEqual(extractFieldRefs(null), []);
  assert.deepEqual(extractFieldRefs(undefined), []);
  assert.deepEqual(extractFieldRefs(42), []);
});

test("extractFieldRefs: deeply nested call with string and number literals", () => {
  assert.deepEqual(
    extractFieldRefs('IF(StageName = "Closed Won", Amount * 1.08, 0)'),
    ["StageName", "Amount"]
  );
});

test("extractFieldRefs: PriorValue inner ref is captured (acceptable)", () => {
  // PriorValue is a function; the inner ref is what gets captured. Documented
  // limitation — it's the current value, not the prior one, but that's fine.
  assert.deepEqual(
    extractFieldRefs("PriorValue(Amount) + 1"),
    ["Amount"]
  );
});

test("isRichFormula: IMAGE", () => {
  assert.equal(isRichFormula('IMAGE("/img/x.png", "alt")'), true);
});

test("isRichFormula: HYPERLINK with whitespace", () => {
  assert.equal(isRichFormula("  HYPERLINK( Url__c, Name )"), true);
});

test("isRichFormula: plain arithmetic is not rich", () => {
  assert.equal(isRichFormula("Amount * 1.08"), false);
});
