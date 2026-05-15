import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseRecordUrl,
  lightningHostToApiHost,
} from "../addon/content/url-parser.js";

test("parseRecordUrl: standard production Lightning detail page", () => {
  const got = parseRecordUrl(
    "https://acme.lightning.force.com/lightning/r/Opportunity/006XX000003DHP1/view"
  );
  assert.deepEqual(got, { objectApiName: "Opportunity", recordId: "006XX000003DHP1" });
});

test("parseRecordUrl: 18-char record id", () => {
  const got = parseRecordUrl(
    "https://acme.lightning.force.com/lightning/r/Opportunity/006XX000003DHP1AAO/view"
  );
  assert.equal(got.recordId, "006XX000003DHP1AAO");
});

test("parseRecordUrl: custom object with __c suffix", () => {
  const got = parseRecordUrl(
    "https://acme.lightning.force.com/lightning/r/Custom_Object__c/a01XX000004CABC/view"
  );
  assert.deepEqual(got, { objectApiName: "Custom_Object__c", recordId: "a01XX000004CABC" });
});

test("parseRecordUrl: sandbox host", () => {
  const got = parseRecordUrl(
    "https://acme--qa.sandbox.lightning.force.com/lightning/r/Account/001XX000003GZAB/view"
  );
  assert.deepEqual(got, { objectApiName: "Account", recordId: "001XX000003GZAB" });
});

test("parseRecordUrl: related-list segment still extracts the parent record", () => {
  const got = parseRecordUrl(
    "https://acme.lightning.force.com/lightning/r/Account/001XX000003GZAB/related/Opportunities"
  );
  assert.deepEqual(got, { objectApiName: "Account", recordId: "001XX000003GZAB" });
});

test("parseRecordUrl: list page is rejected", () => {
  assert.equal(parseRecordUrl("https://acme.lightning.force.com/lightning/o/Opportunity/list"), null);
});

test("parseRecordUrl: setup page is rejected", () => {
  assert.equal(parseRecordUrl("https://acme.lightning.force.com/lightning/setup/Home"), null);
});

test("parseRecordUrl: just a pathname (not full URL) works", () => {
  const got = parseRecordUrl("/lightning/r/Opportunity/006XX000003DHP1/view");
  assert.deepEqual(got, { objectApiName: "Opportunity", recordId: "006XX000003DHP1" });
});

test("parseRecordUrl: null / empty / invalid", () => {
  assert.equal(parseRecordUrl(null), null);
  assert.equal(parseRecordUrl(""), null);
  assert.equal(parseRecordUrl("not a url"), null);
});

test("lightningHostToApiHost: standard My Domain swap", () => {
  assert.equal(
    lightningHostToApiHost("acme.lightning.force.com"),
    "acme.my.salesforce.com"
  );
});

test("lightningHostToApiHost: sandbox swap", () => {
  assert.equal(
    lightningHostToApiHost("acme--qa.sandbox.lightning.force.com"),
    "acme--qa.sandbox.my.salesforce.com"
  );
});

test("lightningHostToApiHost: already an API host is unchanged", () => {
  assert.equal(
    lightningHostToApiHost("acme.my.salesforce.com"),
    "acme.my.salesforce.com"
  );
});
