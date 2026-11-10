# Spec: In-App Voice Shortage Capture

Status: Draft
Date: 2026-11-06
Primary client: Web/PWA
Languages: Hebrew and English

## 1. Summary

Add an in-app voice workflow that lets an authenticated household member describe missing or low-stock products in natural language. The application records audio after an explicit user gesture, transcribes it server-side, uses AI to extract shopping-related intent, compares the result with the household catalog, stock, and active shopping list, and presents a review screen before any mutation occurs.

The feature is intentionally a propose-and-confirm workflow. The model interprets language; deterministic application services authorize access, match authoritative household state, prevent duplicate writes, validate quantities and categories, and commit only the actions explicitly approved by the user.

Example input:

> We are almost out of milk, there are only two eggs left, we need bread, and do not buy rice because we have enough. Remind me to call the doctor.

Example review result:

- Milk: found in stock and considered low; propose adding it.
- Eggs: found in stock; show the current quantity and propose adding only if the user confirms.
- Bread: not found in stock or the active list; propose a new grocery item.
- Rice: explicitly not needed; show it as ignored.
- Call the doctor: unrelated to shopping; omit from proposed writes and optionally show it in the ignored summary.

## 2. Goals

- Let a household member capture several shortages faster than typing them individually.
- Understand conversational Hebrew and English, including negation, corrections, quantities, and irrelevant speech.
- Explain what the application understood relative to the current household state.
- Distinguish existing stock items, items already on the shopping list, known catalog products, and unknown products.
- Allow the user to review, edit, remove, or approve proposed additions.
- Prevent the AI model from directly mutating household data.
- Preserve list authorization, multi-tenant isolation, observability, and existing grocery validation rules.
- Degrade safely when recording, transcription, AI interpretation, or state reconciliation fails.

## 3. Non-goals

- Always-on listening or a custom wake word in the Web/PWA client.
- Background recording while the app is closed or suspended.
- Siri, Shortcuts, n8n, or smart-speaker integration.
- Automatic writes without user review in the first release.
- Treating the transcript or model response as authoritative household state.
- General-purpose reminders or commands unrelated to shopping.
- Automatically decrementing stock based on speech.
- Long-lived conversational memory across independent recordings.
- Retaining raw audio indefinitely.

## 4. User experience

### 4.1 Entry point

Add a prominent microphone action to the shopping-list experience. It must have an accessible text label such as **Report shortages by voice** and must not replace existing typed entry.

Because browser microphone APIs require user permission and normally require an explicit gesture, Web/PWA v1 starts only after the user taps the microphone action. Once recording begins, the rest of the flow can be completed without typing.

### 4.2 Recording state

The recording surface shows:

- a clear recording indicator and elapsed time;
- stop and cancel controls;
- a short privacy notice;
- the selected language, with automatic detection allowed only as a fallback;
- a maximum-duration warning;
- an accessible non-visual announcement when recording starts and stops.

Recommended v1 limits:

- maximum duration: 90 seconds;
- maximum upload size: 10 MB;
- accepted browser formats: `audio/webm`, `audio/mp4`, and `audio/ogg` when supported;
- one recording processed at a time per client session.

### 4.3 Processing state

After recording stops, the client uploads the audio and shows progress through user-facing stages:

1. Uploading recording.
2. Transcribing speech.
3. Comparing products with the household.
4. Preparing review.

The user may cancel the local UI wait, but cancellation does not guarantee that an upload already received by the server stops immediately. The server must still avoid any write before confirmation.

### 4.4 Review state

The review screen displays the normalized transcript and groups understood entries into:

1. **Ready to add** — a validated addition is proposed.
2. **Already on the list** — no duplicate addition is selected by default.
3. **Found in stock** — current stock context is shown; addition remains a user decision.
4. **New or unmatched products** — name/category/quantity can be edited before approval.
5. **Needs clarification** — low-confidence or materially ambiguous entries are not selected by default.
6. **Not needed or irrelevant** — visible in a compact ignored summary, with no write action.

Every proposed item supports:

- selected/unselected state;
- editable normalized name;
- category selection;
- optional quantity and unit;
- target temporary/custom list when applicable;
- a short explanation of why the action was proposed;
- confidence-sensitive clarification without exposing a misleading raw percentage as certainty.

Primary action copy should state the exact write count, for example **Add 3 items**. The confirmation surface must never imply that ignored, ambiguous, or duplicate entries will be added.

### 4.5 Completion

After confirmation, show a result summary with:

- items added;
- items skipped because they became duplicates or stale between review and commit;
- items that failed and can be retried safely;
- a link back to the active shopping list.

## 5. Functional requirements

### FR-1: Capture audio

- Request microphone permission only after an explicit user gesture.
- Support cancel before upload.
- Stop automatically at the configured duration limit.
- Reject unsupported or oversized recordings with a recoverable, localized message.
- Do not silently continue recording after navigation, modal closure, or permission revocation.

### FR-2: Authenticate and authorize

- Both analysis and confirmation endpoints require a valid Firebase ID token.
- The server must authorize the authenticated principal against the requested `listId`.
- A client-provided list ID, user email, transcript, product ID, or category is untrusted input.
- Cross-household data must never be included in model context or returned in a response.

### FR-3: Transcribe server-side

- Send audio only to a server-side transcription adapter.
- Return a bounded transcript plus detected or selected language.
- Apply provider timeouts and map provider errors to stable application error codes.
- Do not log raw audio or the full transcript in normal application logs.
- Raw audio should be processed ephemerally and discarded after the analysis request completes unless an explicit, future retention policy is approved.

### FR-4: Interpret shopping intent

The interpretation provider must return structured output validated by a schema. Each spoken entry has:

- `spokenName`;
- `normalizedName`;
- `intent`: `add`, `low_stock`, `not_needed`, `already_have`, `clarify`, or `irrelevant`;
- optional `quantity` and `unit`;
- optional correction relationship to an earlier phrase;
- short `reason` suitable for the review UI;
- bounded confidence metadata for routing, not for authorization.

The interpreter must account for:

- negation: "do not buy milk";
- correction: "three bottles, actually two";
- approximate shortage: "we are almost out of milk";
- existing supply: "we already have rice";
- multiple items in one utterance;
- Hebrew inflection, colloquial names, and mixed Hebrew/English product names;
- non-shopping content and prompt-like speech embedded in the recording.

The model output is data, never executable instructions.

### FR-5: Reconcile with authoritative household state

Deterministic application code must compare interpreted entries with a fresh, authorized snapshot containing only the fields required from:

- active groceries;
- stock;
- categories/catalog information;
- active custom-list context.

Matching should be layered:

1. exact normalized match;
2. known alias match when aliases exist;
3. conservative semantic suggestion;
4. unmatched product.

Semantic suggestions must not silently merge products. If a match would change the product identity materially, the entry moves to `needs_clarification`.

The reconciler produces one of these deterministic statuses:

- `ready_to_add`;
- `already_listed`;
- `in_stock`;
- `new_product`;
- `needs_clarification`;
- `ignored`.

### FR-6: Require explicit approval

- Analysis creates proposals only; it performs no grocery writes.
- The client submits only the proposal actions the user approved.
- Edited names, categories, quantities, and units are validated again by the server.
- Unknown products require a valid category before they can be committed.
- Ambiguous entries are never preselected.

### FR-7: Commit safely

- Confirmation must re-authorize the list and re-check current household state.
- Existing unpurchased list items must not be duplicated.
- If an equivalent item is currently marked purchased, the domain policy must explicitly choose either reactivation or a new record; v1 should reuse the application's existing grocery behavior where possible.
- A confirmation request uses an idempotency key so retries cannot create duplicate grocery records.
- The response reports `added`, `skipped`, and `failed` actions independently.
- Partial failure must not be presented as complete success.

### FR-8: Support correction and retry

- Users can edit interpreted fields before confirmation without re-recording.
- Transcription or interpretation failure permits retrying the same local recording while it remains available in the current client session.
- A new recording creates a new analysis session.
- Expired or already-committed analysis sessions fail closed and instruct the user to analyze again.

## 6. Proposed architecture

```text
Shopping List UI
  -> VoiceCapture component (MediaRecorder)
  -> POST /api/lists/:listId/voice-shortages/analyze (multipart audio)
       -> authenticated user handler
       -> VoiceShortageAnalysisService
            -> TranscriptionProvider
            -> VoiceShortageInterpreter (structured AI output)
            -> HouseholdSnapshotService
            -> VoiceShortageReconciler (deterministic)
            -> short-lived AnalysisSessionRepository
  <- transcript + review proposal + analysisSessionId

Review UI
  -> user edits/selects proposed actions
  -> POST /api/lists/:listId/voice-shortages/confirm
       -> authenticated user handler
       -> VoiceShortageConfirmationService
            -> load/consume analysis session
            -> re-authorize and re-read relevant state
            -> validate approved actions
            -> GroceryCommandService / repository transaction boundary
            -> idempotency store
  <- added + skipped + failed results
```

### 6.1 Responsibility boundaries

| Layer | Responsibility |
| --- | --- |
| Presentation | Record audio, show states, collect edits and explicit approval. |
| Transcription adapter | Convert supported audio into bounded text. |
| AI interpreter | Extract semantic shopping intent into a strict schema. |
| Reconciler | Compare interpreted intent with authoritative household state. |
| Analysis-session store | Bind a proposal to the user, list, expiry, and original normalized interpretation. |
| Confirmation service | Revalidate approval, handle staleness/idempotency, and coordinate writes. |
| Grocery domain | Enforce authorization, field limits, duplicate/reactivation policy, and persistence. |
| Observability | Record timings, stage outcomes, error codes, and counts without retaining sensitive content by default. |

This is a bounded workflow, not an autonomous agent. A small orchestrated service is preferred over an open-ended tool-calling loop because the stages and permitted mutations are known in advance.

### 6.2 Proposed module layout

```text
src/
  components/
    voice-shortages/
      VoiceCapture.tsx
      VoiceShortageReview.tsx
      VoiceShortageResult.tsx
  hooks/
    useVoiceShortageCapture.ts
  client/api/
    voiceShortages.ts
  modules/
    voiceShortages/
      index.ts
      server.ts
      domain/
        voiceShortageSchemas.ts
      application/
        analyzeVoiceShortages.service.ts
        confirmVoiceShortages.service.ts
        voiceShortageReconciler.ts
        transcriptionProvider.ts
        voiceShortageInterpreter.ts
        analysisSessionRepository.ts
      infrastructure/
        providerTranscription.server.ts
        geminiVoiceShortageInterpreter.server.ts
        firebaseAnalysisSessionRepository.server.ts
  routes/api/lists/$listId/voice-shortages/
    analyze.tsx
    confirm.tsx
```

Provider names are illustrative. The application interfaces must not depend on one transcription or model vendor.

## 7. Workflow state machine

Client-visible states:

```text
idle
  -> requesting_permission
  -> recording
  -> uploading
  -> analyzing
  -> reviewing
  -> confirming
  -> completed
```

Recoverable transitions:

- `requesting_permission -> permission_denied -> idle`
- `recording -> cancelled -> idle`
- `uploading|analyzing -> analysis_error -> recording|uploading`
- `reviewing -> recording` when the user chooses to replace the analysis
- `confirming -> confirmation_error -> reviewing`

Terminal server-side analysis-session states:

- `pending_review`;
- `committed`;
- `expired`;
- `cancelled`.

Only `pending_review` may transition to `committed`, and that transition must be atomic with the idempotency claim or otherwise protected from concurrent confirmation requests.

## 8. API contracts

### 8.1 Analyze recording

```http
POST /api/lists/:listId/voice-shortages/analyze
Authorization: Bearer <firebase-id-token>
Content-Type: multipart/form-data
```

Multipart fields:

| Field | Required | Rules |
| --- | --- | --- |
| `audio` | yes | Supported media type, maximum 10 MB |
| `language` | yes | `he` or `en` |
| `listName` | no | Maximum 100 characters |

Successful response (`200`):

```json
{
  "analysisSessionId": "opaque-id",
  "expiresAt": "2026-11-06T18:15:00.000Z",
  "transcript": "חסר חלב אבל לא צריך אורז",
  "language": "he",
  "items": [
    {
      "proposalId": "opaque-item-id",
      "spokenName": "חלב",
      "normalizedName": "חלב",
      "status": "in_stock",
      "intent": "low_stock",
      "matched": {
        "kind": "stock",
        "id": "stock-id",
        "name": "חלב",
        "quantity": 0.5,
        "unit": "ליטר"
      },
      "proposedAction": {
        "type": "add_grocery",
        "name": "חלב",
        "category": "מוצרי חלב",
        "quantity": 1,
        "unit": "ליטר",
        "selectedByDefault": true
      },
      "reason": "The speaker said the household is almost out of milk."
    }
  ],
  "ignoredCount": 1
}
```

The client must treat IDs and proposed values as untrusted display data until confirmation succeeds.

### 8.2 Confirm selected actions

```http
POST /api/lists/:listId/voice-shortages/confirm
Authorization: Bearer <firebase-id-token>
Content-Type: application/json
Idempotency-Key: <uuid>
```

```json
{
  "analysisSessionId": "opaque-id",
  "actions": [
    {
      "proposalId": "opaque-item-id",
      "type": "add_grocery",
      "name": "חלב",
      "category": "מוצרי חלב",
      "quantity": 1,
      "unit": "ליטר",
      "listName": null
    }
  ]
}
```

Successful response (`200` or `207` for an explicitly adopted multi-status contract):

```json
{
  "analysisSessionId": "opaque-id",
  "added": [
    { "proposalId": "opaque-item-id", "groceryId": "new-grocery-id", "name": "חלב" }
  ],
  "skipped": [],
  "failed": []
}
```

### 8.3 Stable error codes

| HTTP | Code | Meaning |
| --- | --- | --- |
| `400` | `INVALID_AUDIO` | Missing, unsupported, empty, or oversized audio |
| `400` | `INVALID_REQUEST` | Invalid fields or confirmation actions |
| `401` | `UNAUTHORIZED` | Missing or invalid identity token |
| `403` | `ACCESS_DENIED` | Principal cannot access the household list |
| `409` | `ANALYSIS_ALREADY_COMMITTED` | Session was previously confirmed |
| `409` | `STALE_PROPOSAL` | Current list state materially invalidates the proposal |
| `410` | `ANALYSIS_EXPIRED` | Review session has expired |
| `413` | `AUDIO_TOO_LARGE` | Upload exceeds the configured limit |
| `415` | `UNSUPPORTED_AUDIO_TYPE` | Media type cannot be processed |
| `429` | `RATE_LIMITED` | User or household limit exceeded |
| `502` | `TRANSCRIPTION_FAILED` | Transcription provider failed or timed out |
| `502` | `INTERPRETATION_FAILED` | AI output failed or could not be validated |
| `500` | `VOICE_SHORTAGE_ERROR` | Unexpected server failure |

Responses must not expose provider payloads, prompts, credentials, stack traces, or another household's data.

## 9. Domain and matching rules

### 9.1 Normalization

Normalize deterministically before matching:

- trim and collapse whitespace;
- use Unicode-safe case normalization where applicable;
- normalize common punctuation and quantity separators;
- preserve the original spoken text for review;
- do not over-stem Hebrew names when it risks merging distinct products.

### 9.2 Duplicate policy

- An equivalent unpurchased grocery in the same target list results in `already_listed`.
- Quantity merging is never implicit in v1. The review UI may offer an explicit future action to update quantity.
- A newly created unmatched item must not be duplicated by a concurrent confirmation; the confirmation service rechecks just before writing.

### 9.3 Stock policy

- Stock is context, not an automatic veto.
- A spoken `low_stock` intent may propose a grocery even when the stock quantity is greater than zero.
- A spoken `already_have` or `not_needed` intent must never propose an addition.
- The stock low threshold can support the explanation but cannot override explicit user speech without showing the conflict.

### 9.4 Confidence policy

- Confidence influences review routing only.
- Low-confidence names, negation, quantities, or product matches require clarification.
- No confidence score can bypass authorization, schema validation, duplicate checks, or user approval.
- Thresholds must be configurable and evaluated against a fixed bilingual test dataset before rollout.

## 10. Security and privacy

- Require HTTPS for browser microphone use outside local development.
- Apply authentication, list authorization, upload limits, content-type checks, timeouts, and rate limits before expensive provider calls where possible.
- Treat transcript text as untrusted input that may contain prompt injection. The interpreter receives it as delimited data and has no mutating tools.
- Send the minimum household context required for reconciliation. Prefer deterministic local matching before sending product context back to a model.
- Never expose model or transcription credentials to the browser.
- Do not persist raw audio in Firebase, logs, analytics, or error reports in v1.
- Store analysis sessions with a short TTL, recommended at 15 minutes.
- Persist only the minimum proposal and audit metadata required for confirmation and debugging.
- Redact or hash user and household identifiers in provider-facing observability where feasible.
- Provide a user-facing explanation that audio is uploaded for transcription and analysis.

## 11. Reliability, concurrency, and idempotency

- Set independent timeouts for upload parsing, transcription, interpretation, snapshot retrieval, and confirmation writes.
- Do not retry model or transcription requests indefinitely. At most one bounded retry may be used for transient failures.
- Invalid structured AI output may receive one constrained repair attempt, then fail safely.
- Use an opaque `analysisSessionId` bound to principal, list, and expiry.
- Use an `Idempotency-Key` bound to the analysis session and normalized approved action set.
- Concurrent confirmations must return the first durable result rather than create duplicates.
- Reconciliation during analysis is advisory; confirmation always rechecks authoritative state.
- A partial commit response must identify exactly which actions succeeded.

## 12. Observability

Create one correlation/run ID for the full analyze request and retain it through confirmation metadata where useful. Record structured events for:

- permission outcome on the client, without device fingerprinting;
- recording duration, encoded size, and media type;
- upload, transcription, interpretation, reconciliation, review, and commit latency;
- provider/model identifiers and bounded token/usage metadata;
- counts by reconciliation status;
- schema-validation and repair outcomes;
- confirmation counts: requested, added, skipped, failed;
- stable error code and stage.

Do not record raw audio, full transcripts, full prompts, or full household snapshots in standard logs.

## 13. Accessibility and localization

- All microphone controls require visible labels, keyboard access, and screen-reader announcements.
- Recording state cannot rely on color or animation alone.
- Hebrew UI must preserve RTL layout while product codes, numbers, and units remain readable.
- User-facing reasons are localized by the application from stable reason codes where possible; model-generated explanation text is secondary.
- Editing and confirmation must remain fully usable without voice input.
- Motion respects reduced-motion preferences.

## 14. Testing strategy

### 14.1 Unit tests

- audio metadata and limit validation;
- structured interpreter schemas;
- Hebrew/English normalization;
- negation and correction precedence;
- deterministic reconciliation across groceries, stock, catalog, and unmatched products;
- duplicate and low-stock policies;
- confirmation validation, session ownership, expiry, and idempotency;
- redaction of sensitive fields from logs.

### 14.2 Provider contract tests

- recorded fake transcription responses;
- valid, malformed, empty, and oversized structured AI outputs;
- timeout, quota, authentication, and transient provider failures;
- one repair attempt followed by safe failure;
- no provider network dependency in the default unit-test suite.

### 14.3 Integration tests

- authenticated analysis creates a review session and performs no grocery write;
- unauthorized and cross-household requests fail before provider invocation;
- confirmation adds only selected actions;
- current state changing between analysis and confirmation is handled safely;
- duplicate confirmation returns the durable prior result;
- partial repository failure is reported accurately.

### 14.4 UI and end-to-end tests

- microphone permission accepted, denied, and revoked;
- start, stop, cancel, duration limit, upload progress, and retry;
- review editing and selection behavior;
- ambiguous and ignored items are not preselected;
- exact confirmation count and completion summary;
- Hebrew RTL and English LTR flows;
- keyboard and screen-reader operation using mocked media and API layers.

### 14.5 Evaluation dataset

Maintain a versioned, privacy-safe bilingual dataset containing at least:

- direct additions;
- negations;
- self-corrections;
- low-stock phrases;
- colloquial and mixed-language product names;
- quantities and units;
- irrelevant sentences;
- adversarial prompt-like speech;
- noisy or incomplete transcripts;
- ambiguous product matches.

Track intent classification, product extraction, negation accuracy, quantity accuracy, reconciliation status accuracy, false-addition rate, latency, and provider cost. False additions and missed negations are release-blocking quality signals.

## 15. Acceptance criteria

- An authorized user can record a supported audio clip inside the app and receive a review result in Hebrew or English.
- The analysis step performs zero grocery, stock, category, or catalog mutations.
- Relevant products are reconciled against the requested household's current groceries, stock, and categories.
- Items already on the active list are not selected for duplicate addition.
- Explicitly negated or irrelevant content never becomes an approved action by default.
- Ambiguous and low-confidence items require user intervention.
- Only explicitly selected, server-validated actions are committed.
- Confirmation is authorized, idempotent, and safe against state changes after analysis.
- Raw audio and full transcripts are absent from standard logs and are not persistently stored in v1.
- Permission denial, provider failure, expiry, and partial commit each produce clear recoverable UI states.
- Automated tests cover the deterministic reconciler, schemas, authorization, confirmation, and primary UI states.

## 16. Rollout plan

1. Build the deterministic contracts, fake providers, and evaluation dataset.
2. Implement the analysis and confirmation services with no production UI entry point.
3. Add the microphone and review UI behind a feature flag.
4. Enable for owner/admin accounts in one household.
5. Measure false additions, missed negations, latency, failure rate, and cost.
6. Expand to invited household members after quality thresholds are met.
7. Consider voice-based confirmation or native background capabilities only after the review workflow is reliable.

## 17. Product and engineering decisions still required

- Which transcription provider and model meet Hebrew accuracy, latency, privacy, and cost requirements?
- Should v1 use a server memory/cache, Firestore, or Realtime Database for short-lived analysis sessions and idempotency records?
- Should a purchased grocery be reactivated or should confirmation create a new grocery record?
- Does approving an unmatched product create only a grocery record, or also a reusable catalog alias/product?
- Should stock quantities be interpreted against `low_threshold` automatically, or used only as review context?
- Is the target list always the active list, or may the user choose a temporary/custom list during review?
- What retention and user-facing privacy wording is required for transcripts and minimal audit metadata?
- What measured false-addition and missed-negation thresholds are required for general availability?

## 18. Future extensions

- Follow-up questions inside the app for ambiguous products or quantities.
- Spoken confirmation after the visual review model proves reliable.
- Recipe-aware voice input such as "add everything missing for lasagna."
- Explicit quantity updates for an item already on the shopping list.
- Product alias learning after repeated user-approved corrections.
- Native iOS capture optimized for longer sessions and richer audio controls.
- Optional on-device transcription when accuracy and platform support are sufficient.
