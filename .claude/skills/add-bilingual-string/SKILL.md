---
name: "add-bilingual-string"
description: "Add or edit user-facing text in fridge-list-app while keeping Hebrew/English i18n in sync. Use whenever a component change introduces a new label, button, toast, or error message shown to the user."
---

fridge-list-app is bilingual (Hebrew default/RTL, English/LTR) via `react-i18next`, initialized in `src/i18n/config.ts`. Every user-facing string change must touch both languages — shipping a string in only one language is not acceptable in this project.

## Where strings live

`src/i18n/locales/{he,en}/{common,shoppingList,stock,receipts,categories,admins}.json` — namespaced JSON resource files. Pick the namespace matching the feature area (e.g. a stock-tab string goes in `stock.json`, not `common.json`, unless it's genuinely shared chrome like a button label used everywhere).

## Steps

1. Add the key to the appropriate namespace file under **both** `locales/he/` and `locales/en/`, with matching key names.
2. Use the key in the component via the namespace's `t()` hook — check a neighboring string in the same file for the exact call pattern already in use.
3. Do not translate values that are also matched by equality against stored Firebase data (e.g. unit presets like `'יח'''`, `'ק"ג'`, or the protected category name `"אחר"`). Those are persisted data values, not display copy — translating them would silently break matching logic. Only translate strings that are purely UI chrome.

## Don't forget

- `src/hooks/useSyncHtmlLangDir.ts` keeps `<html lang>`/`<html dir>` in sync automatically — you don't need to touch this for a normal string addition.
- If you're adding a wholly new namespace (rare), it needs to be registered in `src/i18n/config.ts`, not just dropped in the `locales/` folder.

## Verify

Switch languages via the header's language-switch button and visually confirm the new string renders correctly in both, including RTL layout for Hebrew if the string is long or contains punctuation.
