---
name: "shadcn-design-system"
description: "Use shadcn/ui correctly in fridge-list-app — which primitives exist, the chalkboard theme mapping, and the bespoke-chrome-vs-shadcn line. Use whenever adding a new interactive UI element (button, form control, modal, dropdown, dialog) or converting an existing native/hand-rolled element."
---

Tailwind v4, CSS-first config in `src/App.css`'s `@theme inline` block — maps
shadcn's expected color tokens (`--color-background`, `--color-primary`,
`--color-destructive`, etc.) onto this app's own chalkboard palette variables
(`--board`, `--board-edge`, `--chalk`, `--chalk-dim`, plus `--border-alpha`/
`--input-alpha`/`--danger`). **Never introduce shadcn's default look** — every new
primitive must route through these variables, not hardcoded shadcn defaults.

## Primitives that exist (`src/components/ui/`)

`button`, `dialog`, `alert-dialog`, `input`, `label`, `select`, `textarea`,
`checkbox`, `dropdown-menu`. Check this list before adding a new one — a need that
looks new (e.g. "a themed alert box") may already be one variant/prop away from an
existing primitive rather than a new component (`AlertDialog` covers both
confirm-style and alert-style dialogs, just with different button configurations).

## The bespoke-chrome-vs-shadcn line

Converted (as of a full-app audit + conversion pass): `window.confirm`/`prompt`/
`alert` → `useDialogService()` (below), the raw reconcile checkbox → `Checkbox`, the
hand-rolled settings menu → `DropdownMenu`.

**Deliberately left as plain, custom-styled `<button>`/native elements, not shadcn**:
FABs, list pills, tab links, the stock +/- stepper, icon-only action buttons (⚙️ ✎ 🗑
ℹ️ 📷, language switch, sign in/out). These aren't raw/unstyled HTML — they're
heavily custom-themed to match this app's specific visual identity, which is exactly
the "genuinely bespoke shape" carve-out, not an oversight to "finish" converting.
Don't convert these just because they're technically `<button>` tags.

**Left native, permanently — no shadcn equivalent exists**: `<input type="color">`
(category color picker), `<input type="file">` (photo/receipt upload). Both are
OS-native pickers; there's nothing to swap them for.

## `useDialogService()` — themed replacement for `window.confirm`/`prompt`/`alert`

`src/hooks/DialogServiceContext.tsx`, mounted once at the app root (`Layout.tsx`).
Promise-based: `if (!(await confirm(message))) return`, `const value = await
prompt(message)`, `await alert(message)`. Built specifically because native
`window.*` dialogs render as OS-chrome popups that completely break out of the dark
chalkboard theme — an actual reported jarring-UX issue, not a hypothetical. Use this
for any new confirm/prompt/alert-shaped interaction; don't reach for `window.confirm`
et al. in new code, and don't hand-roll a one-off modal for the same purpose.

## When extending `ReceiptReconcileModal`/similar confirm-then-write modals

If a modal's confirm action performs a Firebase write, make the `onConfirm` prop
return a `Promise` and have the modal manage its own `saving` state around it
(disable buttons, show a "…ing" label) — this is the established pattern (see
`ReceiptReconcileModal.tsx`) precisely because a fire-and-forget write with no
awaited state was a real, shipped bug (closed the modal and looked successful even
when the write silently failed). Also make sure the modal's own confirm handler has
a `catch`, not just a `finally` — a bare `try/finally` lets a rejected `onConfirm`
propagate as an unhandled rejection instead of just re-enabling the form.
