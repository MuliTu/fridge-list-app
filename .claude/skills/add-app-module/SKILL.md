---
name: "add-app-module"
description: "Add a new route, tab, or feature module to the fridge-list-app TanStack Start frontend, following this project's existing structure, auth, and design-system conventions. Use when building a new screen or significant feature in the React app itself (not an n8n workflow change)."
---

fridge-list-app's frontend is **TanStack Start** (React + TanStack Router, file-based routing, Vite/Nitro), TypeScript throughout (`strict: false`, `strictNullChecks: true`). Follow the existing structure rather than introducing a new pattern.

## Folder conventions

- `src/routes/` — file-based route tree, must stay at exactly this path (TanStack Router convention). `__root.tsx` is the document shell. Never hand-edit `src/routeTree.gen.ts` — it's generated.
- `src/components/` — shared UI, one file per modal/component.
- `src/hooks/` — context providers and custom hooks (`AuthContext`, `GroceriesFeedContext`, `useCategories`, `useCollapsedSections`).
- `src/lib/` — `firebase.ts` (all Firebase reads/writes — put new Firebase calls here, not inline in components), `formatDateTime.ts`, `categories.ts`.
- `src/types.ts` — shared interfaces; add new record shapes here rather than inlining types in a component.

## Auth model to replicate

Viewing is always open (no sign-in required) — realtime `onValue` subscriptions are unconditional. Editing (writes) requires Google sign-in AND the email being in `ADMIN_EMAILS` or the live `/admins` path. Use `useAuth()`'s `canEdit` to gate any new write action — don't invent a new permission check.

## Design system

Use shadcn/ui primitives from `src/components/ui/` (`Button`, `Dialog`, `Input`, `Textarea`, `Label`, `Select`) for standard form controls and modals — don't hand-roll new `.modal-backdrop`/native `<input>` markup, that pattern was deliberately migrated away from. Bespoke app-chrome shapes (FAB, pills, tab links) are the one exception left as custom-styled elements; match that precedent only for genuinely bespoke shapes, not for ordinary buttons/inputs.

Tailwind v4 CSS-first config lives in `src/App.css`'s `@theme inline` block, mapped onto this app's existing chalkboard palette variables (`--board`, `--board-edge`, `--chalk`, `--chalk-dim`) — don't introduce shadcn's default look, keep new components on the existing palette.

## Required for any new module

1. **i18n** — see the `add-bilingual-string` skill; every new string needs `he` + `en` entries.
2. **Realtime data, not one-shot fetch** — if the module shows live household data, subscribe via `onValue`, matching how `/groceries`, `/stock`, `/receipts` already work; don't add a server loader for this kind of data (SSR here only renders the static shell).
3. **Graceful degradation** — if an automated step (AI extraction, image upload, network call) fails, fall back to a manual/default path rather than blocking the user or losing their input. This is a consistent, deliberate pattern across the whole app.
4. **Versioning** — once the module works, use the `release-bump` skill (package.json version + CHANGELOG.md + TODO.md).

## Verify before calling it done

```
npx tsc --noEmit
npm run build
```

Both must pass clean. For anything visible in the browser, actually drive it and check real DOM/console/network state — don't just eyeball the code as correct.
