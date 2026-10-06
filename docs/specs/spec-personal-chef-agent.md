# Spec: AI Personal Chef Agent

> Historical design input. The current [flagship spec](spec-flagship-readiness.md)
> supersedes pantry assumptions: only explicitly selected purchased ingredients are
> permitted; no implicit pantry additions. Old task completion is not live validation.


Status: Draft
Language: TypeScript
Frameworks: TanStack Start / React / Firebase / LangGraph
Primary graph: `personal_chef`

## 1. Goal

Add an AI Personal Chef feature that helps the signed-in household turn currently available groceries into recipes.

The feature starts from groceries that are already marked as checked/purchased, guides the user through a short chat-style preference flow, asks which available products to cook with, suggests 1-5 meals that use only those products plus assumed pantry basics, shows each suggestion with an image, and lets the user save a selected meal into a persistent Recipes section.

The AI workflow must be implemented as a separate LangGraph/LangChain process from the existing create-ticket graph and must be testable locally through LangGraph Studio.

## 2. Scope

### In scope

- A new `personal_chef` LangGraph graph.
- A local LangGraph Studio entry in `langgraph.json`.
- A server-side API for generating recipe suggestions.
- Firebase persistence for saved recipes.
- A new Recipes UI section.
- A second floating chef button on the shopping-list experience.
- A compact chef chat popup.
- A product-selection mode that shows only checked/purchased grocery products.
- A select-all option for available products.
- A visible blue application border while the product-selection mode is active.
- A recipe suggestion modal with slider/carousel navigation.
- Meal images found through a web/search-backed provider when available.
- Graceful fallback when AI or image search fails.
- Hebrew and English UI strings.
- Focused unit/component tests and local verification.

### Out of scope for v1

- Streaming AI responses.
- Long-term chef conversation memory.
- Nutrition/macros calculation.
- Dietary medical advice.
- Editing a saved recipe after save.
- Deleting or rating recipes unless already trivial in the Recipes section design.
- Firebase Storage. The project should continue avoiding paid Firebase tiers.
- Client-side direct calls to third-party AI/image/search APIs.

## 3. User experience

### Entry point

The shopping-list page gets a second floating action button for the personal chef.

Requirements:

- It must be visually distinct from the existing primary floating button.
- It must be accessible with an `aria-label`.
- It must respect RTL/LTR layout.
- It must be hidden or disabled when the user cannot edit/read the active list.

### Chef chat popup

Clicking the chef button opens a compact chat popup.

Initial message:

- The chef greets the user.
- The chef explains that it can cook from products already checked in the list.
- The chef asks a short sequence of questions.

Question flow:

1. Number of people.
2. Meal type, for example quick dinner, full dinner, snack, breakfast, lunch, or meal prep.
3. Optional preferences, for example vegetarian, kid-friendly, spicy, light, high-protein, no oven.
4. Product selection.

The chat does not need free-form LLM back-and-forth in v1. It may be a guided chat UI with quick replies and one optional text field for preferences.

### Product-selection mode

When the chef asks the user to choose products:

- The app border changes to blue.
- The list view shows only groceries that are marked as checked/purchased.
- Each visible product can be selected.
- A select-all control selects every visible available product.
- The user can cancel selection and return the app to normal state.
- Empty state: if there are no checked products, the chef explains that no available products were found and suggests checking purchased items first.

Implementation note:

- The current `GroceryItem.bought === true` field is the checked/purchased signal.
- The implementation must use the active household/list scope and the app's existing list API/subscription conventions.

### Recipe suggestions modal

After the user submits selected products, the app opens a recipe suggestion modal.

Requirements:

- Show 1-5 meal suggestions.
- Present suggestions in a slider/carousel style modal.
- Each suggestion shows:
  - title
  - image or image fallback
  - short description
  - used products
  - assumed pantry basics
  - estimated time
  - servings
  - ingredients
  - steps
  - save button
- Suggestions must state when pantry basics such as salt, pepper, oil, water, sugar, flour, garlic powder, common spices, or lemon juice are assumed.
- Suggestions must not invent non-basic missing products as required ingredients.

### Saving a recipe

When the user chooses a meal:

- The app saves it to Firebase.
- The modal shows saving state and does not close before the write completes.
- On success, the recipe appears in the Recipes section.
- On failure, the user keeps the generated recipe in the modal and sees a recoverable error.

## 4. Firebase data model

Saved recipes are list-scoped household data.

Canonical path for v1:

```text
/users/{listId}/recipes/{recipeId}
```

Implementation must verify the current active list ID conventions before coding. The active application has already moved groceries, stock, receipts, and categories under `users/{listId}`, so recipes should follow that structure rather than a root `/recipes` collection.

Record shape:

```ts
interface RecipeRecord {
  key: string
  title: string
  description: string
  servings: number
  mealType: 'quick_dinner' | 'full_dinner' | 'breakfast' | 'lunch' | 'snack' | 'meal_prep' | 'other'
  estimatedTimeMinutes: number | null
  selectedProducts: RecipeProduct[]
  assumedBasics: string[]
  ingredients: RecipeIngredient[]
  steps: string[]
  image: {
    url: string | null
    sourceUrl?: string | null
    sourceName?: string | null
    alt: string
  }
  chefNotes?: string | null
  createdAt: string
  createdBy: string | null
  listId: string
  source: {
    kind: 'personal_chef'
    graphRunId: string
    model?: string
  }
}

interface RecipeProduct {
  groceryKey: string
  name: string
  category: string
  quantity?: number | null
  unit?: string | null
}

interface RecipeIngredient {
  name: string
  quantity: string | null
  fromSelectedProducts: boolean
  pantryBasic: boolean
}
```

Persistence rules:

- Stamp `createdAt` and `createdBy`.
- Do not store raw model prompts.
- Do not store full image binaries for web images.
- If an image lookup fails, store `image.url: null` with a generated alt value.
- Saved recipe writes must be logged through the existing client/server logging pattern.

Firebase rules:

- Recipes require read/write rules matching other list-scoped household collections.
- If the deployed rules do not yet cover `users/{listId}/recipes`, implementation must include the exact rule update and verification steps.

## 5. API contracts

### Generate suggestions

```http
POST /api/personal-chef/suggest-recipes
Authorization: Bearer <firebase-id-token>
Content-Type: application/json
```

Request:

```json
{
  "listId": "owner_email_com",
  "servings": 2,
  "mealType": "quick_dinner",
  "preferences": "kid friendly, no oven",
  "products": [
    {
      "groceryKey": "-abc",
      "name": "eggs",
      "category": "Dairy",
      "quantity": 12,
      "unit": "pcs"
    }
  ],
  "language": "en"
}
```

Validation:

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `listId` | string | yes | Current active list key |
| `servings` | number | yes | Integer, 1-20 |
| `mealType` | string | yes | Supported enum value |
| `preferences` | string | no | Trimmed, maximum 1,000 characters |
| `products` | array | yes | 1-50 selected checked products |
| `products[].groceryKey` | string | yes | Existing grocery key |
| `products[].name` | string | yes | 1-120 characters |
| `language` | string | no | `he` or `en`; defaults from UI |

Security:

- The route must authenticate the Firebase ID token.
- The route must authorize access to `listId`.
- The route must verify selected products still exist in the active list and still have `bought === true`.
- Client-provided product fields are hints for UX only; authoritative product names/categories come from Firebase where feasible.

Success response:

```json
{
  "success": true,
  "runId": "uuid",
  "recipes": [
    {
      "id": "candidate-1",
      "title": "Vegetable Omelet",
      "description": "A quick skillet meal...",
      "servings": 2,
      "mealType": "quick_dinner",
      "estimatedTimeMinutes": 20,
      "selectedProducts": [],
      "assumedBasics": ["salt", "pepper", "oil"],
      "ingredients": [],
      "steps": [],
      "image": {
        "url": "https://example.com/image.jpg",
        "sourceUrl": "https://example.com",
        "sourceName": "Example",
        "alt": "Vegetable omelet"
      },
      "chefNotes": "Best served warm."
    }
  ]
}
```

Error response:

```json
{
  "success": false,
  "runId": "uuid",
  "error": {
    "code": "MODEL_ERROR",
    "message": "Could not create recipes right now"
  }
}
```

Expected errors:

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `INVALID_JSON` | Request body is not valid JSON |
| `400` | `INVALID_REQUEST` | Request body fails validation |
| `401` | `UNAUTHORIZED` | Missing or invalid Firebase token |
| `403` | `ACCESS_DENIED` | User cannot access the list |
| `409` | `PRODUCTS_UNAVAILABLE` | Products are no longer checked/available |
| `500` | `SERVER_NOT_CONFIGURED` | Required server config is missing |
| `502` | `MODEL_ERROR` | LLM/graph failed |
| `502` | `IMAGE_SEARCH_ERROR` | Image lookup failed and no fallback was possible |

Image lookup failure should usually degrade to image-less recipes instead of failing the whole route.

### Save recipe

Two implementation choices are acceptable:

1. Preferred target architecture: `POST /api/recipes`.
2. Compatibility phase: client writes directly to Firebase through `src/lib/firebase.ts`, matching current client write patterns.

If choosing the compatibility phase, the implementation must keep the write isolated in `src/lib/firebase.ts` and make it easy to migrate behind a server API later.

Preferred request:

```http
POST /api/recipes
Authorization: Bearer <firebase-id-token>
Content-Type: application/json
```

```json
{
  "listId": "owner_email_com",
  "recipe": {
    "title": "Vegetable Omelet",
    "description": "...",
    "servings": 2,
    "mealType": "quick_dinner",
    "estimatedTimeMinutes": 20,
    "selectedProducts": [],
    "assumedBasics": ["salt", "pepper", "oil"],
    "ingredients": [],
    "steps": [],
    "image": {
      "url": null,
      "alt": "Vegetable Omelet"
    },
    "chefNotes": "...",
    "source": {
      "kind": "personal_chef",
      "graphRunId": "uuid"
    }
  }
}
```

## 6. LangGraph design

Graph name: `personal_chef`

Proposed file layout:

```text
src/
  modules/
    recipes/
      application/
        recipeCommands.service.ts
        recipeRepository.ts
      domain/
        recipeSchemas.ts
      infrastructure/
        firebaseAdminRecipeRepository.server.ts
        langchain/
          personalChefAgent.ts
          personalChefGraph.ts
          personalChefGraph.test.ts
          personalChefStudioGraph.server.ts
          recipeImageSearchTool.ts
          recipeSuggestionSchemas.ts
      server.ts
      index.ts
  routes/
    api/
      personal-chef/
        suggest-recipes.tsx
        suggest-recipes.test.ts
      recipes.tsx
      recipes.test.tsx
```

Graph shape:

```text
START
  -> validate_cooking_request
  -> generate_recipe_candidates
  -> normalize_and_guardrail_recipes
  -> search_images
  -> finalize_response
  -> END
```

State:

```ts
interface PersonalChefState {
  runId: string
  request: PersonalChefRequest
  selectedProducts: RecipeProduct[]
  pantryBasics: string[]
  candidateRecipes: RecipeCandidate[]
  imageSearchResults: RecipeImageResult[]
  finalRecipes: RecipeCandidate[]
  warnings: string[]
}
```

Graph requirements:

- Use `@langchain/langgraph` with a compiled `StateGraph`.
- Export a Studio-compatible `graph` from `personalChefStudioGraph.server.ts`.
- Add this entry to `langgraph.json`:

```json
{
  "graphs": {
    "create_ticket": "./src/modules/ticketing/infrastructure/langchain/createTicketStudioGraph.server.ts:graph",
    "personal_chef": "./src/modules/recipes/infrastructure/langchain/personalChefStudioGraph.server.ts:graph"
  }
}
```

- Use structured output validation with zod or equivalent schema validation.
- Set a recursion/step limit.
- Produce 1-5 recipe candidates.
- Keep all user/product input as data, not higher-priority instructions.
- Avoid persistent checkpoints in v1.
- Do not let the model call mutating tools.
- The image-search step may be deterministic code outside the LLM node.

Local testing:

```bash
npm run langgraph:dev
```

Then test graph input:

```json
{
  "runId": "local-chef-test-1",
  "request": {
    "servings": 2,
    "mealType": "quick_dinner",
    "preferences": "no oven",
    "language": "en"
  },
  "selectedProducts": [
    {
      "groceryKey": "-eggs",
      "name": "eggs",
      "category": "Dairy",
      "quantity": 6,
      "unit": "pcs"
    },
    {
      "groceryKey": "-tomato",
      "name": "tomatoes",
      "category": "Vegetables",
      "quantity": 4,
      "unit": "pcs"
    }
  ]
}
```

## 7. Prompt and guardrails

The chef prompt must require:

- Answer in the requested UI language.
- Create only recipes that can be made with selected products.
- Do not require pantry basics, spices, oils, or outside ingredients of any kind.
- Do not require any product that was not explicitly selected.
- If the selected products cannot make a coherent meal, return the closest simple preparation and clearly say it is limited.
- Produce practical steps for a home cook.
- Prefer safe food handling language for raw eggs, meat, chicken, or fish.
- Do not provide medical or diet-treatment claims.

The server must validate the model output:

- 1-5 recipes.
- Each recipe has at least one step.
- Every non-basic ingredient must match a selected product by normalized name.
- `servings` must match or reasonably adapt from the request.
- `estimatedTimeMinutes` must be bounded.
- Title/description/steps must be bounded in length.

If validation fails:

- Try one repair pass at most.
- If repair fails, return a graceful error and keep the user in the chat.

## 8. Image search

The user requested web/search images.

Provider options:

- Use a server-side image-search provider if a configured API exists.
- If no provider is configured, skip image lookup and return image-less suggestions.
- Do not scrape arbitrary search result HTML from the client.
- Do not expose provider credentials to the browser.

Environment:

```dotenv
PERSONAL_CHEF_IMAGE_SEARCH_PROVIDER=disabled
PERSONAL_CHEF_IMAGE_SEARCH_API_KEY=
PERSONAL_CHEF_IMAGE_SEARCH_ENDPOINT=
```

Image result requirements:

- URL must be `http` or `https`.
- Store attribution fields when provided.
- Use a safe placeholder/fallback UI when the image cannot load.
- The recipe itself must remain usable without an image.

## 9. UI implementation notes

Likely components:

```text
src/components/
  PersonalChefButton.tsx
  PersonalChefChat.tsx
  PersonalChefProductPicker.tsx
  RecipeSuggestionModal.tsx
  RecipeCard.tsx
```

Likely route:

```text
src/routes/recipes.tsx
```

Design constraints:

- Use existing app visual language.
- Use shadcn dialog primitives for modal surfaces.
- Custom FAB styling may stay bespoke, matching existing FAB conventions.
- All icon-only buttons need labels.
- Use logical CSS properties for RTL/LTR.
- Avoid card-inside-card layouts.
- Blue border selection state should be global but temporary, removed on submit/cancel/unmount.

Recipes section:

- Add a navigation entry consistent with existing route/tab patterns.
- Subscribe in realtime to `/users/{listId}/recipes`.
- Show empty state when no recipes are saved.
- Show saved recipe detail in a dialog or route-local detail view.

## 10. Graceful degradation

Expected fallbacks:

- No checked products: chat explains the issue and exits selection mode.
- AI route fails: show a friendly error and keep selected products/preferences.
- Image search fails: show recipe suggestions without images.
- Save fails: keep the modal open and allow retry.
- Firebase rules reject recipes: show error and document the required rules change.
- Product availability changed between selection and submit: show which products are unavailable and ask the user to reselect.

## 11. Tests and verification

Unit tests:

- Request validation for `/api/personal-chef/suggest-recipes`.
- Auth and access-denied behavior.
- Product availability verification.
- Graph output validation and repair/failure paths.
- Image search disabled/failure behavior.
- Recipe save payload shape.
- Firebase recipe repository path.

Component tests:

- Chef button opens popup.
- Empty checked-products state.
- Select all checked products.
- Blue border is applied and removed.
- Suggestion modal slider navigation.
- Save button shows pending/success/error states.

Manual local verification:

1. Run `npm run langgraph:dev`.
2. Invoke `personal_chef` in LangGraph Studio with selected products.
3. Run `npm run dev`.
4. Sign in locally.
5. Mark several groceries as checked.
6. Open chef popup.
7. Complete the guided flow.
8. Select products and generate suggestions.
9. Save one recipe.
10. Confirm it appears in Recipes.
11. Confirm the saved record exists at `/users/{listId}/recipes/{recipeId}`.

Required checks before done:

```bash
npm run typecheck
npm run test
npm run build
```

If visible UI changes are implemented, also inspect the app in both Hebrew and English.

## 12. Open decisions

1. Image-search provider: choose a concrete provider or keep v1 provider-disabled with graceful image fallback.
2. Save path: implement preferred authenticated `POST /api/recipes` now or use the current compatibility pattern in `src/lib/firebase.ts`.
3. Recipes section shape: top-level route/tab versus a section inside the shopping-list page.
4. Pantry basics list: confirm the exact default set for Hebrew and English display.

None of these block the first implementation if the defaults above are accepted.
