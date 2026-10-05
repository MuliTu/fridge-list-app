---
description: Pull the top Approved Trello ticket and implement it end-to-end (Approved → In Progress → Done)
---

Pull the first ticket from the **Approved** list on the "Fridge app" Trello board and take it all the way to Done. Work autonomously through the whole flow — don't stop to ask the user in chat; if you have a question, put it in the ticket's comments (see step 7).

## Board / list IDs (Fridge app board `6a50ca96490e3f2e13fda0aa`)
- **Approved**: `6a5154b4d10d2e9f29aeb043`
- **In Progress**: `6a5154744d22b575f41c1ced`
- **Done**: `6a515476a217e6b647d96c3c`

(These are the current IDs; if a `move_card`/`get_list_cards` call fails, re-fetch with `get_lists` on the board in case a list was recreated.)

## Steps

0. **Start from the latest main.** `git fetch origin` and create the working branch from `origin/main` (never from a stale local checkout). Then read the relevant project skills before writing code (`.claude/skills/` — e.g. `add-app-module`, `senior-frontend`, `firebase-data-model`, `add-bilingual-string`, `n8n-groceries-workflow` as applicable).

1. **Take the first ticket from "Approved".** `trello_get_list_cards` on the Approved list and pick the top (first) card. If Approved is empty, say so and stop. Read the card's full description (it's a PRD).

2. **Move it to "In Progress"** (`move_card` → In Progress list).

3. **Implement the feature**, following this repo's conventions and skills. Scope with senior judgment: implement what actually applies to this app; skip PRD items that don't (e.g. analytics events, API changes the app doesn't need) and note those as deliberate out-of-scope. Keep the app's patterns — i18n (he+en), realtime Firebase, graceful degradation, shadcn/bespoke-chrome line.

4. **Verify**: `npx tsc --noEmit` and `npm run build` must both pass clean; add/keep Jest tests green; drive the change in the browser preview when it's observable there (per the preview verification workflow). If the browser tooling is unavailable, say so honestly and fall back to build + unit tests.

5. **Version + changelog** (`.claude/skills/release-bump`): bump `package.json` and add a one-sentence `CHANGELOG.md` entry. Re-check `origin/main`'s version immediately before finalizing so parallel PRs don't collide.

6. **Ship**: commit on the feature branch, push, and open a PR (`gh pr create`). Do **not** merge it yourself.

7. **Finish the ticket**: move the card to **Done** (`move_card` → Done list) and add a **comment** (`trello_add_comment`) stating the **version** it shipped in and the PR link.

## If you have a question
Do **not** interrupt the user in chat. Post the question as a **comment on the ticket** (`trello_add_comment`), then either proceed with the most reasonable assumption (documenting that assumption in the same comment) or, if the question genuinely blocks implementation, leave the card in **In Progress** with the question comment and report that it's blocked pending an answer.
