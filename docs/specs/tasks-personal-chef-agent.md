# Tasks: AI Personal Chef Agent

> Historical design input. The current [flagship spec](spec-flagship-readiness.md)
> supersedes pantry assumptions: only explicitly selected purchased ingredients are
> permitted; no implicit pantry additions. Old task completion is not live validation.


Spec: [Chef spec](spec-personal-chef-agent.md)
Plan: [Chef plan](plan-personal-chef-agent.md)
Status: Draft backlog

## Task Legend

- `PC-00x`: Personal Chef implementation task.
- `sync`: touches shared app architecture, routes, Firebase model, or navigation.
- `async`: can be worked independently after dependencies are complete.
- `blocked`: needs an owner decision before implementation.

## PC-001: Confirm Recipe Data Path and Firebase Rules

Type: `sync`
Dependencies: none

Scope:

- Verify the current active household/list data shape.
- Confirm recipes should live at `/users/{listId}/recipes/{recipeId}`.
- Inspect `database.rules.json` and `database.rules.md` for recipe coverage.
- Document any Firebase Console rule update needed before local/live writes.

Likely files:

- `database.rules.json`
- `database.rules.md`
- [Chef spec](spec-personal-chef-agent.md)

Acceptance criteria:

- The recipe path is confirmed.
- Any required Firebase rule change is documented with exact JSON.
- No feature code starts with an uncertain persistence path.

Verification:

```bash
npm run test -- database-rules
```

## PC-002: Add Recipe Types and Schemas

Type: `sync`
Dependencies: `PC-001`

Scope:

- Add shared recipe types.
- Add domain validation for generated and saved recipes.
- Define meal type enum, selected product shape, ingredient shape, and image metadata shape.

Likely files:

- `src/types.ts`
- `src/modules/recipes/domain/recipeSchemas.ts`
- `src/modules/recipes/domain/recipeSchemas.test.ts`
- `src/modules/recipes/index.ts`

Acceptance criteria:

- Recipe records are typed in one shared place.
- Validation rejects missing required fields and oversized text fields.
- Validation allows image-less recipes.

Verification:

```bash
npm run test -- recipeSchemas
npm run typecheck
```

## PC-003: Implement Recipe Persistence

Type: `sync`
Dependencies: `PC-002`

Scope:

- Create the recipes module persistence boundary.
- Implement list-scoped save and realtime read support.
- Prefer `POST /api/recipes` if staying aligned with the modular-monolith target; otherwise isolate compatibility client writes in `src/lib/firebase.ts`.
- Log save attempts using the existing client/server event pattern.

Likely files:

- `src/modules/recipes/application/recipeRepository.ts`
- `src/modules/recipes/application/recipeCommands.service.ts`
- `src/modules/recipes/infrastructure/firebaseAdminRecipeRepository.server.ts`
- `src/modules/recipes/server.ts`
- `src/routes/api/recipes.tsx`
- `src/lib/firebase.ts`
- `src/modules/observability/application/clientEventRecorder.ts`

Acceptance criteria:

- A valid recipe saves under `/users/{listId}/recipes/{recipeId}`.
- Save rejects unauthorized or invalid requests.
- Save failure is returned as a recoverable error.
- Tests prove path, shape, and auth behavior.

Verification:

```bash
npm run test -- recipes
npm run typecheck
```

## PC-004: Add Personal Chef Graph Schemas

Type: `async`
Dependencies: `PC-002`

Scope:

- Define graph input, state, candidate output, final output, and warning schemas.
- Encode pantry basics in one reusable module.
- Add normalization helpers that compare generated non-basic ingredients against selected products.

Likely files:

- `src/modules/recipes/infrastructure/langchain/recipeSuggestionSchemas.ts`
- `src/modules/recipes/infrastructure/langchain/pantryBasics.ts`
- `src/modules/recipes/infrastructure/langchain/recipeGuardrails.ts`
- `src/modules/recipes/infrastructure/langchain/recipeGuardrails.test.ts`

Acceptance criteria:

- Product-matching guardrails are deterministic.
- Non-basic ingredients not present in selected products are rejected or flagged for repair.
- Pantry basics are allowed.

Verification:

```bash
npm run test -- recipeGuardrails
npm run typecheck
```

## PC-005: Implement Personal Chef LangGraph

Type: `sync`
Dependencies: `PC-004`

Scope:

- Build the `personal_chef` LangGraph.
- Add nodes for validation, generation, guardrail normalization, optional image lookup, and finalization.
- Add one repair pass for invalid model output.
- Keep graph free of mutating tools and persistent checkpoints.

Likely files:

- `src/modules/recipes/infrastructure/langchain/personalChefGraph.ts`
- `src/modules/recipes/infrastructure/langchain/personalChefAgent.ts`
- `src/modules/recipes/infrastructure/langchain/personalChefGraph.test.ts`

Acceptance criteria:

- Graph returns 1-5 validated recipe candidates.
- Graph handles model failure safely.
- Graph handles invalid generated ingredients safely.
- Tests can run with a fake model and no network.

Verification:

```bash
npm run test -- personalChefGraph
npm run typecheck
```

## PC-006: Add LangGraph Studio Entry

Type: `sync`
Dependencies: `PC-005`

Scope:

- Export a Studio-compatible graph.
- Add `personal_chef` to `langgraph.json`.
- Provide a deterministic local fake or low-risk configuration path.

Likely files:

- `src/modules/recipes/infrastructure/langchain/personalChefStudioGraph.server.ts`
- `langgraph.json`
- `.env.example` if present or local setup docs if not

Acceptance criteria:

- `npm run langgraph:dev` exposes both `create_ticket` and `personal_chef`.
- Local graph input from the spec returns recipe candidates.
- Studio setup does not require image search to be configured.

Verification:

```bash
npm run langgraph:dev
```

## PC-007: Implement Image Search Provider Boundary

Type: `async`
Dependencies: `PC-004`

Scope:

- Add a server-side image search abstraction.
- Implement disabled provider behavior.
- Add safe URL validation and attribution fields.
- Leave room for a real web/search provider without exposing credentials to the browser.

Likely files:

- `src/modules/recipes/infrastructure/langchain/recipeImageSearchTool.ts`
- `src/modules/recipes/infrastructure/langchain/recipeImageSearchTool.test.ts`
- `src/lib/safeUrl.ts`

Acceptance criteria:

- Disabled image search returns no image without failing recipes.
- Unsafe URLs are rejected.
- Provider failures degrade to image-less suggestions.

Verification:

```bash
npm run test -- recipeImageSearchTool
```

## PC-008: Add Suggest Recipes API

Type: `sync`
Dependencies: `PC-005`, `PC-007`

Scope:

- Add `POST /api/personal-chef/suggest-recipes`.
- Authenticate Firebase ID token.
- Authorize list access.
- Re-read selected groceries and verify `bought === true`.
- Invoke the chef graph.
- Return safe structured success/error payloads.

Likely files:

- `src/routes/api/personal-chef/suggest-recipes.tsx`
- `src/routes/api/personal-chef/suggest-recipes.test.ts`
- `src/modules/recipes/application/suggestRecipes.service.ts`
- `src/modules/recipes/server.ts`

Acceptance criteria:

- Missing/invalid auth returns `401`.
- Unauthorized list access returns `403`.
- Invalid request returns `400`.
- Unchecked/missing products return `409`.
- Valid checked products return 1-5 recipe suggestions.
- Route logs lifecycle events without prompt or secret leakage.

Verification:

```bash
npm run test -- suggest-recipes
npm run typecheck
```

## PC-009: Add Chef Button and Guided Chat Popup

Type: `async`
Dependencies: `PC-008`

Scope:

- Add a second floating chef button.
- Add guided chat popup for servings, meal type, preferences, and product selection.
- Add all Hebrew and English strings.
- Keep the UI accessible and RTL/LTR-safe.

Likely files:

- `src/components/PersonalChefButton.tsx`
- `src/components/PersonalChefChat.tsx`
- `src/components/PersonalChefChat.test.tsx`
- `src/routes/index.tsx`
- `src/i18n/locales/en/shoppingList.json`
- `src/i18n/locales/he/shoppingList.json`

Acceptance criteria:

- Chef button opens and closes the chat popup.
- User can complete preference questions.
- Empty or invalid preference state is handled.
- New strings exist in Hebrew and English.

Verification:

```bash
npm run test -- PersonalChefChat
npm run typecheck
```

## PC-010: Add Checked Product Selection Mode

Type: `sync`
Dependencies: `PC-009`

Scope:

- Show only checked/purchased groceries during chef product selection.
- Add select-all.
- Add per-product selection.
- Add temporary blue app border.
- Ensure selection mode cleans up on cancel, submit, and unmount.

Likely files:

- `src/components/PersonalChefProductPicker.tsx`
- `src/components/PersonalChefProductPicker.test.tsx`
- `src/components/CategorySection.tsx`
- `src/components/ShoppingListItemRow.tsx`
- `src/routes/index.tsx`
- `src/App.css`

Acceptance criteria:

- Only `bought === true` groceries are selectable.
- Select all selects every visible checked product.
- No checked products shows a clear empty state.
- Blue border appears only during selection mode and is removed reliably.

Verification:

```bash
npm run test -- PersonalChefProductPicker
npm run typecheck
```

## PC-011: Add Recipe Suggestion Modal

Type: `async`
Dependencies: `PC-008`, `PC-010`

Scope:

- Add recipe suggestion slider/modal.
- Render generated recipes, images, fallback image state, ingredients, steps, pantry basics, servings, and estimated time.
- Add save button and pending/error/success states.

Likely files:

- `src/components/RecipeSuggestionModal.tsx`
- `src/components/RecipeSuggestionModal.test.tsx`
- `src/components/RecipeCard.tsx`
- `src/i18n/locales/en/shoppingList.json`
- `src/i18n/locales/he/shoppingList.json`

Acceptance criteria:

- User can navigate 1-5 suggestions.
- Missing images render cleanly.
- Save waits for Firebase/API completion.
- Save failure keeps the modal open with retry available.

Verification:

```bash
npm run test -- RecipeSuggestionModal
npm run typecheck
```

## PC-012: Add Recipes Section

Type: `sync`
Dependencies: `PC-003`, `PC-011`

Scope:

- Add Recipes route or section.
- Add navigation entry following current app patterns.
- Subscribe to saved recipes in realtime.
- Render empty, loading, error, list, and detail states.
- Add bilingual strings.

Likely files:

- `src/routes/recipes.tsx`
- `src/routes/recipes.test.tsx`
- `src/components/Layout.tsx`
- `src/lib/firebase.ts`
- `src/i18n/locales/en/common.json`
- `src/i18n/locales/he/common.json`

Acceptance criteria:

- Saved recipes are visible after refresh.
- Recipe details are readable.
- Empty state is clear.
- Navigation works in Hebrew and English.

Verification:

```bash
npm run test -- recipes
npm run typecheck
```

## PC-013: End-to-End Local Chef Flow

Type: `sync`
Dependencies: `PC-009`, `PC-010`, `PC-011`, `PC-012`

Scope:

- Add or update an e2e smoke flow for the chef feature if practical with mocks.
- Manually verify the full local flow.
- Confirm no browser console errors in the happy path.

Likely files:

- `e2e/smoke.spec.ts`
- `src/test/mocks/*` if needed

Acceptance criteria:

- User can mark groceries checked, open chef, select products, generate suggestions, save a recipe, and view it in Recipes.
- Hebrew and English layouts remain usable.
- Image-search-disabled path still works.

Verification:

```bash
npm run test:e2e
```

## PC-014: Release Prep

Type: `sync`
Dependencies: `PC-013`

Scope:

- Run final checks.
- Update version and release notes if shipping.
- Update TODO/follow-up notes.
- Document image provider decision and any Firebase rule action.

Likely files:

- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `TODO.md`
- `database.rules.md`

Acceptance criteria:

- Typecheck, tests, and build pass.
- Local LangGraph Studio verification is complete.
- Release notes mention Personal Chef and Recipes.
- Any remaining image-provider limitation is explicit.

Verification:

```bash
npm run typecheck
npm run test
npm run build
npm run langgraph:dev
```

## Recommended Execution Order

1. `PC-001`
2. `PC-002`
3. `PC-003`
4. `PC-004`
5. `PC-005`
6. `PC-006`
7. `PC-007`
8. `PC-008`
9. `PC-009`
10. `PC-010`
11. `PC-011`
12. `PC-012`
13. `PC-013`
14. `PC-014`

## Parallel Work Opportunities

- `PC-004` can start after `PC-002` while `PC-003` is in progress.
- `PC-007` can start after `PC-004`.
- `PC-009` can start once `PC-008` has a stable response contract, even before the real graph is perfect.
- `PC-012` can start after `PC-003` with mocked saved recipes.
