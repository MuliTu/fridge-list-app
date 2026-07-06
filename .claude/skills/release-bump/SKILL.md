---
name: "release-bump"
description: "Apply this project's versioning discipline after any notable code change: bump package.json's version, add a CHANGELOG.md entry, and update TODO.md. Use when a feature, fix, or other shippable change to fridge-list-app is complete and about to be marked done."
---

This project (fridge-list-app) requires every notable change to be versioned. Follow this exactly — see `CLAUDE.md`'s "Working conventions" section for the source of these rules.

## 1. Decide the version bump

Read the current version from `package.json`.

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
