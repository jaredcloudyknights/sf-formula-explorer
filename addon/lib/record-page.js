// True when the URL is a Lightning record-detail page on a supported host.

const LIGHTNING_HOST =
  /\.(?:sandbox\.|develop\.)?lightning\.force\.com$/i;
const MY_DOMAIN_HOST = /\.(?:sandbox\.)?my\.salesforce\.com$/i;

export function isRecordPageUrl(url) {
  if (!url) return false;
  try {
    const { pathname, hostname } = new URL(url);
    if (!pathname.includes("/lightning/r/")) return false;
    return LIGHTNING_HOST.test(hostname) || MY_DOMAIN_HOST.test(hostname);
  } catch {
    return false;
  }
}
