---
name: "release-bump"
description: "Apply this project's versioning discipline after any notable code change: bump package.json's version and, once the PR merges, create a GitHub Release. Use when a feature, fix, or other shippable change to fridge-list-app is complete and about to be marked done."
---

This project (fridge-list-app) requires every notable change to be versioned. Follow this exactly — see `CLAUDE.md`'s "Versioning" note and "Working conventions" section for the source of these rules.

**As of 2026-07-17, versioning uses GitHub Releases, not a tracked `CHANGELOG.md` file** — that file was deleted and its full history (v1.0.0–v2.36.0) converted into Releases. The in-app "📝 Changelog" viewer now fetches Releases via a server route instead of importing a file (see `CLAUDE.md`'s "In-app changelog viewer" section).

## 1. Decide the version bump

Read the current version from **`origin/main`'s `package.json`** (`git fetch origin && git show origin/main:package.json`), not just the local working copy — with the branch+PR workflow, other PRs merge into `main` independently of whatever branch you're on, so the local copy can be stale the moment another PR lands. This matters most right before you open or merge a PR (see "Avoiding version conflicts between parallel PRs" below) — a quick local read is fine earlier in a session when you're not about to finalize anything yet.

- **Patch** (`x.y.Z+1`) — bug fix, small tweak, no new user-facing capability.
- **Minor** (`x.Y+1.0`) — new feature or module (e.g. a new module, a new field, a new UI capability).
- Do not bump major without the user explicitly asking for it.

## 2. Update package.json

Edit the `version` field only — don't touch anything else unless the change itself required it. This edit lands in the PR itself (same commit/branch as the feature), so the eventual merge commit on `main` already carries the new version number — this part is unchanged from the old CHANGELOG.md-based process.

## 3. Verify before calling it done

Run, and confirm both pass clean:

```
npx tsc --noEmit
npm run build
```

For anything observable in the browser, actually drive it (not just read the code) and check real DOM/console/network state.

## 4. Do not commit

Never run `git commit` unless the user explicitly asks for it, even mid-way through a versioned feature.

## 5. Create the GitHub Release — only after the PR is actually merged

**Do not tag or create a release from the PR branch itself.** This project squash-merges PRs, so the commit that lands on `main` is a *new* commit (a different SHA than anything on the branch) — a tag created before merge would point at a commit that never ends up on `main`. Wait until the merge is confirmed:

1. Confirm the merge landed: `git fetch origin && git log origin/main -1 --format='%H|%s'` — check the top commit is the expected one (subject usually contains `(#NN)` referencing the PR).
2. Tag that exact commit: `git tag -a vX.Y.Z <sha> -m vX.Y.Z && git push origin vX.Y.Z`.
3. Create the release: `gh release create vX.Y.Z --title vX.Y.Z --notes "<notes>"`. Notes follow the same style the old CHANGELOG.md entries used — one concise sentence per bullet under `### Added`/`### Fixed`/etc., saying what shipped, not a paragraph of implementation detail (the "why" lives in `CONVERSATION.md`, deeper reference in `CLAUDE.md`).
4. `gh release list --limit 1` should show the new tag marked `Latest` — if it isn't (e.g. releases were created out of order), pass `--latest` explicitly to `gh release create` or adjust with `gh release edit vX.Y.Z --latest`.

Since this repo's convention is that Codex does not merge its own PRs, this step is usually a distinct follow-up action — either the user says "it's merged, go ahead," or you notice on a later turn that `origin/main` has moved past your branch's base.

## Avoiding version conflicts between parallel PRs

`package.json`'s `version` field is a single, specific line — if two PR branches each bump it starting from the same base version, whichever merges second gets a real merge conflict on that file (this happened for real more than once: PR #6/#8 both branched from `2.15.2` and bumped independently; more recently, tickets #46/#47/#48 for this same reason, requiring a rebase-and-renumber cleanup after the fact).

This project's branch+PR workflow (see `CLAUDE.md`) means several branches can legitimately be open at once, so this isn't a one-off — treat it as expected, not a surprise each time:

- Do the version bump (steps 1-2 above) as one of the **last** things before a PR is ready, not right after starting the feature. The longer a branch sits open before its version bump lands, the more likely another PR bumps first.
- **Immediately before opening the PR** (and again immediately before merging, if the PR sat open for a while), re-run `git fetch origin && git show origin/main:package.json` to get the true current version — don't trust a version number decided earlier in the session if any time has passed.
- If a conflict still happens anyway (another PR merged in the gap between your check and your merge — always possible, not just theoretical), resolve it by rebasing your branch onto the new `origin/main` and renumbering your own bump to land *after* it — never renumber or edit a version that's already merged into `main`, since that rewrites shipped history. Re-run the verification in step 3 after resolving, since the version string itself changed. If **multiple** sibling branches are all being renumbered in the same session, track which version each one claims as you go — it's easy to reassign one branch's conflict away by picking a number another still-unmerged sibling branch already claimed.
