---
name: "senior-frontend"
description: "Apply senior/staff-level front-end engineering judgment when writing or reviewing React/TypeScript code in fridge-list-app (src/routes, src/components, src/hooks). Use whenever adding, editing, or reviewing UI code in this app — component structure, state placement, re-renders, accessibility, effect correctness — not just 'does it work' but 'is this how a senior engineer on this specific codebase would build it.'"
---

fridge-list-app is TanStack Start + React 18 + TypeScript (`strict: false`, `strictNullChecks: true`) + Tailwind v4 + shadcn/ui. See `.claude/skills/add-app-module` for the baseline folder/auth/i18n conventions — this skill is the judgment layer on top of that: the things a senior front-end engineer would push back on in review, applied to *this* codebase's actual patterns, not generic React advice.

## Component decomposition

This app has already been through one decomposition pass (`routes/index.tsx` split into `ShoppingListItemRow`, `ListPicker`, `CategorySection`) — that's the precedent to match. A route file mixing data-shaping logic (grouping/sorting entries), event handlers, *and* deep JSX for a repeated row is a sign it needs the same treatment. Push back on:
- A component file that both fetches/transforms data and renders a non-trivial repeated list item inline — extract the row.
- A prop list that's grown past ~6-7 props with several booleans — often means the component is doing two jobs.
- Copy-pasted JSX blocks across two routes (e.g. a stat row, a card) that aren't extracted yet.

Don't over-decompose a one-off 15-line block used exactly once — that's the "no premature abstraction" rule biting from the other direction.

## State placement: local vs context vs prop-drilled

`GroceriesFeedContext` exists for one specific reason: `/groceries` is a live `onValue` subscription needed by multiple tabs/components at once (the shared toast + status line), so it's one context instead of N duplicate subscriptions. That's the bar for adding a new context here — **shared, live, cross-component data**, not "I don't want to pass two props." If something is only read by a parent and one direct child, pass it as a prop; don't reach for context just to skip one hop.

Conversely, don't hand-roll prop drilling through 3+ layers for something that's genuinely global (auth state, the live feed) — that's what `AuthContext`/`GroceriesFeedContext`/`DialogServiceContext` are for. Check `useAuth()`, `useGroceriesFeed()`, `useDialogService()`, `useCategories()` before inventing a new prop path for something one of them already exposes.

## Effect dependency correctness

`ItemDetailModal.tsx` has a real, intentional example: an effect that fetches an image only depends on `entry.image_ref`, with an explicit `// eslint-disable-next-line react-hooks/exhaustive-deps` and a reason (only fetch once per image ref, not on every `previewUrl` change it also reads). That's the standard to hold new effects to — if you need to omit a dependency, the omission needs a one-line reason in a comment, not a silent disable. If you can't articulate why, the dependency array is probably wrong and the effect is probably going to re-run or under-run in a way that will surprise someone later.

Watch for the more common version of this bug: an effect keyed on an object/array literal built fresh every render (e.g. `useEffect(() => ..., [someObjectComputedInline])`) — that re-runs every render regardless of what actually changed. Depend on the primitive fields that actually matter instead.

## Re-renders and inline functions

This app doesn't currently memoize (`useMemo`/`useCallback`/`React.memo`) — its lists are small (a household grocery/stock list, not thousands of rows), so premature memoization would be exactly the kind of abstraction this project avoids. Don't introduce it reflexively. Where it *does* matter: a context value object built fresh every render (e.g. `{ user, canEdit, onSignIn, ... }`) forces every consumer to re-render even when nothing changed — if a context provider's value is a growing object literal, check whether it's actually causing visible re-render churn before "fixing" it; don't add `useMemo` around a context value as a reflex, it's real code to justify.

## Accessibility

Every icon-only button in this app (⚙️ ✎ 🗑 ℹ️ 📷, language switch) carries `aria-label={t('...')}`, not just a visual emoji — that's the existing bar for *any* new icon button, not optional polish. When wiring a shadcn `Dialog`/`AlertDialog` that doesn't need a visible title (e.g. `DialogServiceContext.tsx`'s confirm/prompt dialogs use `<AlertDialogTitle className="sr-only">`), keep the title element for screen readers — Radix's Dialog/AlertDialog warn/misbehave without one, and removing it entirely to "clean up" the DOM breaks accessibility silently.

RTL matters concretely here, not abstractly: this app flips between Hebrew (`dir="rtl"`) and English (`dir="ltr"`) live via `useSyncHtmlLangDir`. Don't hardcode `left`/`right`, `margin-left`, etc. in new CSS — use the logical properties already used throughout (`inset-inline-end`, `margin-inline-start`, `text-align: start`) so layout doesn't mirror incorrectly in one language.

## TypeScript judgment

`strict: false` + broad `catch (err: any)` blocks are an accepted, existing convention here — don't "fix" that pattern unprompted in unrelated code, it'll just create review noise. Do still type the things this project already types carefully: shared record shapes belong in `src/types.ts` (`GroceryItem`, `StockItem`, `Category`, `Receipt`, `ReceiptItem`, `AuthUser`), not inlined per-component — if you're writing an inline object type that looks like it should be a shared shape, check `types.ts` first, and add to it rather than duplicating.

## Design system boundary

shadcn/ui module export [`./shadcn-design-system`](./shadcn-design-system) is the boundary between this app's code and the design system. Don't reach into `node_modules/shadcn/ui` to import a component directly — if it's not exported from `./shadcn-design-system`, it isn't part of the design system, and you shouldn't be using it in this app. If you need a new component, add it to `./shadcn-design-system` first, then use that export in your route/component.
