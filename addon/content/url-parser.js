// Extract { objectApiName, recordId } from a Salesforce Lightning URL.
// Returns null when the URL is not a record-detail page.
//
// Accepted shapes:
//   /lightning/r/Opportunity/006XX000003DHP1/view
//   /lightning/r/Opportunity/006XX000003DHP1/view?ws=%2Flightning%2Fr%2F...
//   /lightning/r/Custom_Object__c/a01XX.../view
//   /lightning/r/Account/001XX.../related/Opportunities  (parent record, still useful)
// Rejected:
//   /lightning/o/Opportunity/list
//   /lightning/setup/...

const RECORD_PATH = /\/lightning\/r\/([A-Za-z_][A-Za-z0-9_]*)\/([A-Za-z0-9]{15,18})(?:\/|$)/;
const ID_15_OR_18 = /^[A-Za-z0-9]{15}([A-Za-z0-9]{3})?$/;

export function parseRecordUrl(urlOrPath) {
  if (!urlOrPath || typeof urlOrPath !== "string") return null;
  let path;
  try {
    path = urlOrPath.startsWith("/") ? urlOrPath : new URL(urlOrPath).pathname;
  } catch {
    return null;
  }
  const m = path.match(RECORD_PATH);
  if (!m) return null;
  const recordId = m[2];
  if (!ID_15_OR_18.test(recordId)) return null;
  return { objectApiName: m[1], recordId };
}

// Derive the API host (where the `sid` cookie lives) from the Lightning host.
//   acme.lightning.force.com           -> acme.my.salesforce.com
//   acme.sandbox.lightning.force.com   -> acme.sandbox.my.salesforce.com
// If the host doesn't match a Lightning pattern, return it unchanged.
export function lightningHostToApiHost(host) {
  if (!host) return host;
  if (host.endsWith(".develop.lightning.force.com")) {
    return host.replace(".develop.lightning.force.com", ".develop.my.salesforce.com");
  }
  if (host.endsWith(".sandbox.lightning.force.com")) {
    return host.replace(".sandbox.lightning.force.com", ".sandbox.my.salesforce.com");
  }
  if (host.endsWith(".lightning.force.com")) {
    return host.replace(".lightning.force.com", ".my.salesforce.com");
  }
  return host;
}
