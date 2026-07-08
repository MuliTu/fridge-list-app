---
name: "release-bump"
description: "Apply this project's versioning discipline after any notable code change: bump package.json's version, add a CHANGELOG.md entry, and update TODO.md. Use when a feature, fix, or other shippable change to fridge-list-app is complete and about to be marked done."
---

This project (fridge-list-app) requires every notable change to be versioned. Follow this exactly — see `CLAUDE.md`'s "Working conventions" section for the source of these rules.

## 1. Decide the version bump

Read the current version from **`origin/main`'s `package.json`** (`git fetch origin && git show origin/main:package.json`), not just the local working copy — with the branch+PR workflow, other PRs merge into `main` independently of whatever branch you're on, so the local copy can be stale the moment another PR lands. This matters most right before you open or merge a PR (see "Avoiding version conflicts between parallel PRs" below) — a quick local read is fine earlier in a session when you're not about to finalize anything yet.

- **Patch** (`x.y.Z+1`) — bug fix, small tweak, no new user-facing capability.
- **Minor** (`x.Y+1.0`) — new feature or module (e.g. a new module, a new field, a new UI capability).
- Do not bump major without the user explicitly asking for it.

## 2. Update package.json

Edit the `version` field only — don't touch anything else unless the change itself required it.

## 3. Add a CHANGELOG.md entry

Open `CHANGELOG.md` and add a new entry **at the top** (newest first). Match the existing entry format already in the file (check a couple of existing entries first). Double-check you didn't create a duplicate or out-of-order entry — this has happened before in this project.

## 4. Update TODO.md

`TODO.md` is the local-only, gitignored working checklist. It mirrors shipped versions as checked-off items, plus an "Unreleased — Next up" section for what's not started yet.

- If the item you just shipped was listed under "Unreleased", check it off and move it under the new version heading.
- If it wasn't listed, add it directly as a checked-off item under the new version.

## 5. Verify before calling it done

Run, and confirm both pass clean:

```
npx tsc --noEmit
npm run build
```

For anything observable in the browser, actually drive it (not just read the code) and check real DOM/console/network state.

## 6. Do not commit

Never run `git commit` unless the user explicitly asks for it, even mid-way through a versioned feature.

## Avoiding version conflicts between parallel PRs

`package.json`'s `version` field and the top of `CHANGELOG.md` are both single, specific lines — if two PR branches each bump them starting from the same base version, whichever merges second gets a real merge conflict on both files (this happened for real: PR #6 and PR #8 both branched from `2.15.2`, both bumped to their own next number, and PR #8 conflicted after PR #6 merged first).

This project's branch+PR workflow (see `CLAUDE.md`) means several branches can legitimately be open at once, so this isn't a one-off — treat it as expected, not a surprise each time:

- Do the version bump (step 1-4 above) as one of the **last** things before a PR is ready, not right after starting the feature. The longer a branch sits open before its version bump lands, the more likely another PR bumps first.
- **Immediately before opening the PR** (and again immediately before merging, if the PR sat open for a while), re-run `git fetch origin && git show origin/main:package.json` to get the true current version — don't trust a version number decided earlier in the session if any time has passed.
- If a conflict still happens anyway (another PR merged in the gap between your check and your merge — always possible, not just theoretical), resolve it by keeping the already-merged entry as-is and renumbering your own bump to land *after* it — never renumber or edit an entry that's already on `main`, since that rewrites shipped history. Re-run the verification in step 5 after resolving, since the version string itself changed.
