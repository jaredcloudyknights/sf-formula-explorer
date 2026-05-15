import { test } from "node:test";
import assert from "node:assert/strict";
import {
  substituteFormula,
  formatValue,
  flattenRecord,
} from "../addon/lib/formula-substitute.js";

const segText = (segs) => segs.map((s) =>
  s.kind === "text" ? s.value
  : s.kind === "value" ? s.display
  : `<${s.ref}>`
).join("");

test("substituteFormula: simple arithmetic", () => {
  const segs = substituteFormula("Amount * Quantity__c", {
    Amount: 100,
    Quantity__c: 5,
  });
  assert.equal(segText(segs), "100 * 5");
});

test("substituteFormula: cross-object", () => {
  const segs = substituteFormula("Account.AnnualRevenue * Discount__c", {
    "Account.AnnualRevenue": 1000000,
    Discount__c: 0.1,
  });
  assert.equal(segText(segs), "1000000 * 0.1");
});

test("substituteFormula: missing ref produces a missing segment, keeps the rest", () => {
  const segs = substituteFormula("Amount * Hidden__c", { Amount: 100 });
  // Amount → "100", Hidden__c missing.
  const missing = segs.filter((s) => s.kind === "missing");
  assert.equal(missing.length, 1);
  assert.equal(missing[0].ref, "Hidden__c");
  assert.equal(segText(segs), "100 * <Hidden__c>");
});

test("substituteFormula: string value gets quoted", () => {
  const segs = substituteFormula("Name", { Name: "Acme" });
  assert.equal(segText(segs), '"Acme"');
});

test("substituteFormula: null value renders as BLANK", () => {
  const segs = substituteFormula("Description", { Description: null });
  assert.equal(segText(segs), "BLANK");
});

test("substituteFormula: booleans", () => {
  const segs = substituteFormula("IsClosed", { IsClosed: true });
  assert.equal(segText(segs), "TRUE");
});

test("substituteFormula: string literals in formula are kept verbatim", () => {
  const segs = substituteFormula(
    'IF(StageName = "Closed Won", Amount, 0)',
    { StageName: "Prospecting", Amount: 50 }
  );
  // "Closed Won" must remain quoted-literal; only field refs are replaced.
  assert.equal(segText(segs), 'IF("Prospecting" = "Closed Won", 50, 0)');
});

test("substituteFormula: function calls are not substituted", () => {
  const segs = substituteFormula(
    "IF(Amount > 0, TEXT(YEAR(CloseDate)), \"\")",
    { Amount: 5, CloseDate: "2026-12-01" }
  );
  assert.equal(segText(segs), 'IF(5 > 0, TEXT(YEAR("2026-12-01")), "")');
});

test("substituteFormula: $User globals are left as text", () => {
  // $User.Id stays in the literal output (it lives in the mask, not in refs).
  const segs = substituteFormula("$User.Id = OwnerId", {
    OwnerId: "005XX000001",
  });
  assert.equal(segText(segs), '$User.Id = "005XX000001"');
});

test("formatValue: string with embedded quote is escaped", () => {
  assert.equal(formatValue('he said "hi"'), '"he said \\"hi\\""');
});

test("formatValue: backslashes are escaped", () => {
  assert.equal(formatValue("a\\b"), '"a\\\\b"');
});

test("flattenRecord: direct field", () => {
  const flat = flattenRecord({ Amount: 100 }, ["Amount"]);
  assert.deepEqual(flat, { Amount: 100 });
});

test("flattenRecord: nested cross-object ref", () => {
  const flat = flattenRecord(
    { Amount: 100, Account: { Name: "Acme", Industry: "Tech" } },
    ["Amount", "Account.Name", "Account.Industry"]
  );
  assert.deepEqual(flat, {
    Amount: 100,
    "Account.Name": "Acme",
    "Account.Industry": "Tech",
  });
});

test("flattenRecord: deep nested ref", () => {
  const flat = flattenRecord(
    { Owner: { Manager: { Email: "boss@acme.com" } } },
    ["Owner.Manager.Email"]
  );
  assert.deepEqual(flat, { "Owner.Manager.Email": "boss@acme.com" });
});

test("flattenRecord: ref through null relationship is dropped", () => {
  const flat = flattenRecord(
    { Account: null },
    ["Account.Name"]
  );
  assert.deepEqual(flat, {});
});

test("flattenRecord: ref that doesn't exist is dropped", () => {
  const flat = flattenRecord({ Amount: 100 }, ["Hidden__c"]);
  assert.deepEqual(flat, {});
});

test("substituteFormula: stray token not in knownTopLevel passes through as text", () => {
  // Simulates the bug where the parser flagged "Compound" as a ref, but it's
  // not a real field on the object. With knownTopLevel provided, it should
  // render as plain text rather than a "no access" marker.
  const known = new Set(["Amount", "Account"]);
  const segs = substituteFormula(
    "IF(Compound, Amount, 0)",
    { Amount: 100 },
    known
  );
  // "Compound" comes through as text (no special segment), Amount substituted.
  const missing = segs.filter((s) => s.kind === "missing");
  assert.equal(missing.length, 0);
  // Compose to verify
  const text = segs.map((s) =>
    s.kind === "text" ? s.value
    : s.kind === "value" ? s.display
    : `<${s.ref}>`
  ).join("");
  assert.equal(text, "IF(Compound, 100, 0)");
});

test("substituteFormula: ref in knownTopLevel but missing from values still marks missing", () => {
  const known = new Set(["Amount", "Hidden__c"]);
  const segs = substituteFormula("Hidden__c + 1", {}, known);
  const missing = segs.filter((s) => s.kind === "missing");
  assert.equal(missing.length, 1);
  assert.equal(missing[0].ref, "Hidden__c");
});
