# Plan: AI Personal Chef Agent

> Historical design input. The current [flagship spec](spec-flagship-readiness.md)
> supersedes pantry assumptions: only explicitly selected purchased ingredients are
> permitted; no implicit pantry additions. Old task completion is not live validation.


Spec: [Chef spec](spec-personal-chef-agent.md)
Status: Draft implementation plan

## Phase 0: Confirm Current App Shape

Goal: make the implementation match the live app, not an outdated mental model.

Tasks:

1. Verify active list data paths for groceries, stock, receipts, categories, and the current household/list ID convention.
2. Check current route/tab navigation patterns and decide where Recipes belongs.
3. Inspect existing FAB placement and styling so the chef button does not collide with current actions.
4. Check current LangGraph ticketing implementation and mirror its server-only configuration pattern.
5. Confirm Firebase rules support `users/{listId}/recipes`; if not, prepare the rule update.

Exit criteria:

- Recipes path is confirmed as `/users/{listId}/recipes`.
- UI placement for Recipes and the chef button is chosen.
- Any required Firebase rule change is known before feature work starts.

## Phase 1: Domain Types and Firebase Recipe Persistence

Goal: create the durable recipe model first, independently from AI generation.

Tasks:

1. Add shared recipe types to `src/types.ts`.
2. Add recipe schema validation in a new recipes module.
3. Add Firebase read/write helpers or a repository for list-scoped recipes.
4. Add a save path, preferably authenticated `POST /api/recipes`; use the compatibility client-write path only if keeping scope small is more important for v1.
5. Add realtime recipe subscription support for the future Recipes section.
6. Add tests for record shape, path, validation, and save failure behavior.

Exit criteria:

- A recipe can be saved and read locally without involving LangGraph.
- Tests prove the record path and required fields.

## Phase 2: Personal Chef LangGraph

Goal: make the chef agent independently testable in LangGraph Studio.

Tasks:

1. Create `src/modules/recipes/infrastructure/langchain/personalChefGraph.ts`.
2. Define graph state, input schema, output schema, and recipe candidate schema.
3. Implement graph nodes:
   - validate cooking request
   - generate recipe candidates
   - normalize and guardrail recipes
   - optionally search images
   - finalize response
4. Add `personalChefStudioGraph.server.ts`.
5. Add `personal_chef` to `langgraph.json`.
6. Add tests for valid generation, invalid model output, repair/failure path, and disabled image search.
7. Run `npm run langgraph:dev` and manually invoke the graph with checked-product examples.

Exit criteria:

- `personal_chef` appears in LangGraph Studio.
- It returns 1-5 validated recipe candidates from local test input.
- It works when image search is disabled.

## Phase 3: Suggestion API

Goal: connect the UI to the chef graph through a server-side route.

Tasks:

1. Add `POST /api/personal-chef/suggest-recipes`.
2. Authenticate with Firebase ID token.
3. Authorize access to the requested list.
4. Re-read selected grocery items from Firebase and verify they still exist and have `bought === true`.
5. Invoke the compiled chef graph.
6. Return structured success and error responses.
7. Log request lifecycle without prompts, secrets, or full recipe payloads.
8. Add route tests for validation, unauthorized, access denied, unavailable products, model failure, and success.

Exit criteria:

- API returns recipe suggestions from real checked products.
- Product availability is enforced server-side.

## Phase 4: Chef UI Flow

Goal: build the interactive flow from the shopping list.

Tasks:

1. Add the second floating chef button.
2. Add compact chef chat popup with guided questions:
   - servings
   - meal type
   - preferences
   - product selection
3. Add product-selection state to show only checked products.
4. Add the temporary blue app border while selection mode is active.
5. Add selectable checked-product rows and select-all.
6. Add empty state for no checked products.
7. Submit selected products to `/api/personal-chef/suggest-recipes`.
8. Add bilingual strings for all new UI copy.
9. Add component tests for popup, empty state, select all, border cleanup, and submit states.

Exit criteria:

- User can launch the chef flow and generate suggestions from checked products.
- Selection mode always exits cleanly on submit, cancel, and unmount.

## Phase 5: Recipe Suggestion Modal

Goal: make suggestions reviewable and savable.

Tasks:

1. Add `RecipeSuggestionModal`.
2. Render 1-5 suggestions with slider controls.
3. Show image, fallback image state, ingredients, steps, estimated time, servings, selected products, and pantry basics.
4. Add save action with pending, success, and error states.
5. Persist selected recipe to Firebase.
6. Keep the modal open on save failure.
7. Add tests for slider navigation and save states.

Exit criteria:

- User can inspect multiple suggestions and save one.
- Saved recipe appears in Firebase with the expected shape.

## Phase 6: Recipes Section

Goal: make saved recipes discoverable after the modal closes.

Tasks:

1. Add a Recipes route or navigation section following current app navigation conventions.
2. Subscribe to `/users/{listId}/recipes` in realtime.
3. Render saved recipes with empty, loading, error, and populated states.
4. Add a recipe detail dialog or detail area.
5. Add bilingual strings.
6. Add tests for empty and populated recipe list states.

Exit criteria:

- Saved recipes are visible after refresh and across sessions.

## Phase 7: Verification and Polish

Goal: make the full feature safe to ship.

Tasks:

1. Run `npm run typecheck`.
2. Run `npm run test`.
3. Run `npm run build`.
4. Run `npm run langgraph:dev` and verify `personal_chef`.
5. Run `npm run dev` and manually test:
   - Hebrew and English
   - RTL/LTR layout
   - no checked products
   - selected checked products
   - image search disabled/failure
   - save success
   - save failure if practical to simulate
6. Verify a saved recipe exists at `/users/{listId}/recipes/{recipeId}`.
7. Update `CHANGELOG.md`, `TODO.md`, and package version if this is shipped as a notable feature.

Exit criteria:

- All required checks pass.
- Manual local flow works end to end.
- Any required Firebase rules update is documented.

## Suggested Build Order

1. Recipe persistence.
2. LangGraph chef graph.
3. Suggestion API.
4. Chef popup and product picker.
5. Suggestion modal and save.
6. Recipes section.
7. Full verification.

This order keeps each slice testable on its own and avoids coupling the UI to an unfinished AI path.
