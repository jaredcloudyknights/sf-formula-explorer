# Salesforce Formula Explorer

A Chrome extension that shows Salesforce formula field definitions directly on Lightning record pages, with your current record’s values filled in.

## What it does

On a Lightning record page (for example, an Opportunity), a small magnifying glass icon appears next to each formula field. Click it to see:

1. **The formula** — e.g. `Amount * Days_In_Stage__c`
2. **The same formula with today’s values** — e.g. `100 * 5`

The extension **substitutes** field values into the formula text. It does not calculate the final result. For formulas with `IF()` or `CASE()`, you see the branch that applies to this record with real values, not a single computed number.[

[Demo Video Link Here](https://www.loom.com/share/5ec574c0955c46e8874301d7b812e831)

## Requirements

- Google Chrome (or another Chromium browser that supports Chrome extensions)
- A logged-in Salesforce org using **Lightning Experience**
- A **record detail page** (the standard view for a single record)

## Install

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and choose the **`addon`** folder inside this project.
5. Pin the extension from the puzzle icon in the toolbar if you like — you’ll use it on Salesforce pages.

The extension only runs on Salesforce. It uses your existing login; you do not sign in again inside the extension.

## How to use

1. Open a Lightning record page (URL looks like `/lightning/r/Opportunity/006.../view`).
2. Click the **Salesforce Formula Explorer** icon in the Chrome toolbar.
3. Click **Explore formulas on this page**.
4. Magnifying glass icons appear next to formula fields on that record. Click any icon to open the formula popover.

You can also press **Ctrl+Shift+F** (Windows/Linux) or **Cmd+Shift+F** (Mac) to explore formulas on the current page.

### Always on

By default, you turn on formula icons once per record page using the toolbar button or keyboard shortcut.

To show icons automatically on every record page:

1. Open the extension popup.
2. Check **Always on for Salesforce record pages**.

That preference is saved to your Chrome profile. Uncheck the box to go back to manual activation.

If you turn always-on off while viewing a page, icons already on that page stay until you reload.

## What works

- Production orgs and sandboxes on Lightning record pages
- Standard and custom objects
- Formulas that reference other objects (e.g. `Account.Name`, `Owner.Manager.Email`)
- Fields you cannot read are shown as `<no access: Field__c>`; the rest of the formula still displays

## Limitations

- **Lightning only** — not Salesforce Classic.
- **Record pages only** — not list views, reports, or validation-rule setup screens.
- **Substitution, not evaluation** — you see literal values in the formula text, not the computed outcome.
- Some formula types (e.g. `IMAGE(...)`, `HYPERLINK(...)`) show the formula source only, without value substitution.
- Rollup summary fields are not shown (they are not formula fields in the same sense).

## Privacy

All processing happens in your browser. The extension does not send data to any third-party service. It reads formula and field data from Salesforce using the same session you already have when logged into your org.

## Acknowledgements

- [Salesforce-Inspector-reloaded](https://github.com/tprouvot/Salesforce-Inspector-reloaded/)
  by Thomas Prouvot, MIT-licensed. Used as the architectural template and inspiration.

## License

MIT. See [LICENSE](LICENSE).

JMJ
