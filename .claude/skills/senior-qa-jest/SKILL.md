---
name: "senior-qa-jest"
description: "Apply senior QA engineering judgment to fridge-list-app using Jest — what's actually worth testing in this codebase, how to mock Firebase/react-i18next/TanStack Router without ever touching the real project, and how to structure test suites. Use whenever writing, reviewing, or planning tests for this app, setting up Jest for the first time, or the user mentions unit tests, test coverage, mocking Firebase, or Jest specifically."
---

fridge-list-app has no test suite yet — `TODO.md`'s "Unreleased" section names Vitest + Playwright + Firebase Emulator Suite as the eventual plan, but this skill targets **Jest specifically** per explicit instruction. Jest and Vitest share a near-identical `describe`/`it`/`expect`/mock API, so everything here about *what* to test and *how* to mock is portable if the project ever consolidates on Vitest — only the config/runner specifics below are Jest-only.

## First: there is no test infra yet — set it up before writing tests

If `package.json` has no `jest`/`ts-jest`/`@testing-library/react` in `devDependencies`, that has to be added first, not assumed. This project is ESM (`"type": "module"`), TypeScript with `moduleResolution: "bundler"`, and Vite-bundled — that combination has two concrete Jest gotchas specific to *this* repo, not generic Jest setup boilerplate:

1. **`ChangelogModal.tsx` imports `../../CHANGELOG.md?raw`** — a Vite-only import suffix, declared for TypeScript via a `declare module '*.md?raw'` block in `src/vite-env.d.ts`. Jest has no idea what to do with the `?raw` query string; it needs a `moduleNameMapper` entry that strips the suffix and resolves to the real file (or mocks it to a fixed string) — without this, any test that imports `Layout.tsx` (which imports `ChangelogModal`) fails to even load.
2. **CSS import** (`App.css`, imported from `__root.tsx`) needs a `moduleNameMapper` stub (e.g. `identity-obj-proxy` or a manual mock returning `{}`) — components rendered in tests generally shouldn't drag their whole CSS import chain in, but if a test imports something that transitively imports `App.css`, an unhandled `.css` import will throw.

Use `ts-jest` (this project already has `typescript` as a dependency) or `@swc/jest`, `testEnvironment: 'jsdom'`, and `@testing-library/react` + `@testing-library/jest-dom` for component tests. Don't reach for `create-react-app`-style presets or `babel-jest` unless `ts-jest` proves awkward with the project's `tsconfig.json` (`isolatedModules: true` is already set, which `ts-jest` needs to know about).

## What's actually worth testing here

This app has almost no framework-agnostic business logic file — most of `src/lib/firebase.ts` is a thin wrapper directly around Firebase SDK calls (`push(groceriesRef, {...})`). Testing "did `push` get called with this exact object" is low value and brittle (it breaks on every unrelated field addition, and doesn't test anything Firebase itself doesn't already guarantee). Prioritize instead:

- **Pure logic with real edge cases**: `normalizeName` (trim/lowercase dedup matching used across groceries/stock/receipts — the known "עגבניות" vs "עגבניה" false-negative gap is exactly the kind of thing a test should pin down as a *known, accepted* limitation, not silently regress further), the receipt price-diff calculation in `receipts.tsx` (`priceDiffFor`), the category-fallback logic (`categoryMap.has(entry.category) ? entry.category : OTHER_CATEGORY_NAME`), list-name filtering (permanent vs custom list membership in `index.tsx`).
- **Hooks**: `useCollapsedSections` (localStorage read/write + toggle logic — mock `localStorage`, don't let it touch real browser storage in a jsdom test either, reset between tests), `useCategories` (the defensive seed-if-empty behavior — verify it does NOT write when categories already exist, since that's the one invariant the real function is built around).
- **Component behavior via Testing Library**, focused on interaction outcomes, not implementation: does clicking the bought checkbox call the right handler with the right args; does the reconcile modal's per-row checkbox state toggle independently; does `GroceryItemModal`'s free-text add loop call `onAdd` once per parsed item. Query by role/label text (`getByRole`, `getByLabelText`) the same way this app already writes `aria-label`s for real users — if a test can't find an element by its accessible role/label, that's often a sign the component itself is missing one, not just a test-authoring problem.
- **Not worth testing**: n8n workflow behavior (that's `n8n_test_workflow`/execution-trace territory, see `.claude/skills/n8n-groceries-workflow` — Jest can't and shouldn't reach across to a live n8n instance), TanStack Start SSR shell rendering (this app's SSR only renders static chrome, all real data is client-side `onValue`), and pixel-level styling (this project already has browser-based visual verification as part of its own workflow — Jest snapshot tests of styled output are exactly the brittle-snapshot trap below).

## Mocking Firebase — never touch the real project

`src/lib/firebase.ts` calls `initializeApp`/`getDatabase`/`getAuth`/`getFirestore` at module load time against the real `n8n-vocal-2-db` project. This app's own manual-QA convention this whole session has been: touch the real DB, verify, then delete the test data immediately — that's fine for interactive verification, but an **automated test suite must never do that**, since it'd leave real writes in a shared household's live database on every CI run or `npm test`, and it'd be flaky against real network/quota conditions (this project has already hit real Gemini quota exhaustion once — an automated suite must not be able to fail *for that reason*).

Mock at the `firebase/*` module boundary before anything imports `src/lib/firebase.ts`:

```ts
jest.mock('firebase/app', () => ({ initializeApp: jest.fn() }))
jest.mock('firebase/database', () => ({
  getDatabase: jest.fn(),
  ref: jest.fn((_db, path) => ({ path })),
  onValue: jest.fn((_ref, cb) => { cb({ val: () => null }); return jest.fn() }), // returns unsubscribe
  get: jest.fn(),
  push: jest.fn(() => ({ key: 'mock-key' })),
  set: jest.fn(),
  update: jest.fn(),
  remove: jest.fn()
}))
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
  GoogleAuthProvider: jest.fn(),
  signInWithPopup: jest.fn(),
  onAuthStateChanged: jest.fn(),
  signOut: jest.fn()
}))
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  doc: jest.fn(),
  setDoc: jest.fn(),
  getDoc: jest.fn(),
  deleteDoc: jest.fn()
}))
```

Tune each mock's return shape per test (e.g. `onValue`'s callback receiving a snapshot with real-shaped fake data) rather than testing against `firebase.ts`'s thin wrappers directly wherever avoidable — prefer testing the component/hook that *consumes* the subscription (does the component render the right grouped/sorted list given a fake snapshot), since that's where this app's actual logic lives.

## Mocking react-i18next

Components call `useTranslation()` with varying namespace arrays (`useTranslation(['receipts', 'common'])`, `useTranslation('changelog')`) and use interpolation (`t('shoppingList:deleteListConfirm', { listName, count })`). A minimal mock that covers both shapes:

```ts
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
    i18n: { language: 'he', changeLanguage: jest.fn() }
  })
}))
```

Returning the raw key (plus serialized interpolation values) instead of real Hebrew/English strings keeps assertions language-independent and immune to copy edits — assert on the key (`expect(screen.getByText('receipts:deleteConfirm:{"date":"..."}')` or looser substring matches), never on the actual translated Hebrew/English text, which is exactly the kind of test that breaks every time someone tweaks copy without any real regression.

## Mocking TanStack Router

Components use `Route.useSearch()`, `Route.useNavigate()`, and `<Link>`. Don't try to spin up a full router for a unit test of a single component — mock the specific route's exported `Route` object's methods (`useSearch: () => ({ list: undefined })`, `useNavigate: () => jest.fn()`), and mock `<Link>` from `@tanstack/react-router` as a plain `<a>` unless the test specifically needs routing behavior, in which case use `@tanstack/react-router`'s own test utilities rather than hand-rolling a router.

## Avoiding brittle tests

This app has heavy Hebrew/RTL/emoji content in almost every rendered string — full-tree snapshot tests here age badly (any copy tweak, emoji swap, or i18n key rename fails the snapshot regardless of whether behavior actually changed, and skimming a Hebrew diff to confirm it's "just a wording change" is real friction). Prefer targeted assertions (`getByRole('button', { name: ... })`, checking a callback was invoked with a specific shape) over `toMatchSnapshot()` for anything touching rendered UI. Snapshots are reasonable for small, structurally-stable pure-function outputs (e.g. a parser's normalized output shape) where a diff is actually meaningful to read.
