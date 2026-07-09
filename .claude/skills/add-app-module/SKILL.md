---
name: "add-app-module"
description: "Add a new route, tab, or feature module to the fridge-list-app TanStack Start frontend, following this project's existing structure, auth, and design-system conventions. Use when building a new screen or significant feature in the React app itself (not an n8n workflow change)."
---

fridge-list-app's frontend is **TanStack Start** (React + TanStack Router, file-based routing, Vite-native SSR — this version does **not** use Nitro, see `.claude/skills/vercel-deployment` if that assumption resurfaces anywhere), TypeScript throughout (`strict: false`, `strictNullChecks: true`). Follow the existing structure rather than introducing a new pattern.

## Folder conventions

- `src/routes/` — file-based route tree, must stay at exactly this path (TanStack Router convention). `__root.tsx` is the document shell. Never hand-edit `src/routeTree.gen.ts` — it's generated.
- `src/components/` — shared UI, one file per modal/component.
- `src/hooks/` — context providers and custom hooks (`AuthContext`, `GroceriesFeedContext`, `useCategories`, `useCollapsedSections`).
- `src/lib/` — `firebase.ts` (all Firebase reads/writes — put new Firebase calls here, not inline in components), `formatDateTime.ts`, `categories.ts`.
- `src/types.ts` — shared interfaces; add new record shapes here rather than inlining types in a component.

## Auth model to replicate

As of v2.19.0, viewing the app requires Google sign-in AND the email being in `ADMIN_EMAILS` or the live `/admins` path — `src/components/Layout.tsx` gates all routed content behind this (`canView`) before anything mounts, so a new module's own `onValue` subscriptions never fire for an unauthorized visitor in practice. Editing (writes) uses the same check today (`canEdit` currently equals `canView` — no separate viewer tier exists yet). Use `useAuth()`'s `canEdit`/`canView` to gate new write/read actions — don't invent a new permission check.

## Design system

See `.claude/skills/shadcn-design-system` for the full picture (available primitives,
the bespoke-chrome-vs-shadcn line, the `useDialogService()` pattern) — don't hand-roll
new `.modal-backdrop`/native `<input>` markup or a one-off `window.confirm`, both
were deliberately migrated away from.

## Required for any new module

1. **i18n** — see `.claude/skills/add-bilingual-string`; every new string needs `he` + `en` entries.
2. **Realtime data, not one-shot fetch** — if the module shows live household data, subscribe via `onValue`, matching how `/groceries`, `/stock`, `/receipts` already work; don't add a server loader for this kind of data (SSR here only renders the static shell).
3. **Graceful degradation** — if an automated step (AI extraction, image upload, network call) fails, fall back to a manual/default path rather than blocking the user or losing their input. This is a consistent, deliberate pattern across the whole app.
4. **Tests** — see `.claude/skills/senior-qa-jest` (unit/integration) and `.claude/skills/playwright-e2e` (e2e) for what's actually worth testing and how to mock this app's dependencies.
5. **Versioning** — once the module works, use `.claude/skills/release-bump` (package.json version + CHANGELOG.md + TODO.md).
6. **Judgment calls** — `.claude/skills/senior-frontend` for component/state-design questions, `.claude/skills/senior-backend` if the module touches a server route or n8n.

## Verify before calling it done

```
npx tsc --noEmit
npm run build
```

Both must pass clean. For anything visible in the browser, actually drive it and check real DOM/console/network state — don't just eyeball the code as correct.
