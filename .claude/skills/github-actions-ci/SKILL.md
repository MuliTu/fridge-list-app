---
name: "github-actions-ci"
description: "Work with fridge-list-app's GitHub Actions workflows and PR/CI process — checking CI status, adding/editing workflows, or handling merges. Use whenever a check is failing/red, a new workflow needs adding, someone asks about CI status across open PRs, or a PR is ready to merge."
---

fridge-list-app is a **private** repo on GitHub's free plan — no branch protection
available at all (that needs GitHub Pro for private repos), which shapes several
things below. Repo: `MuliTu/fridge-list-app`.

## The three workflows

- **`.github/workflows/test.yml`** — runs on every push/PR to any branch: install,
  `tsc --noEmit`, the full Jest suite, `npm run build`. This is the real merge gate;
  treat it as required even though nothing enforces that automatically.
- **`.github/workflows/e2e-deploy-check.yml`** — triggers on GitHub's
  `deployment_status` event (fired by Vercel's GitHub App after every deploy), scoped
  to `github.event.deployment.environment == 'Production'` only, hardcoded against
  the stable `fridge-list-app.vercel.app` domain. See `.claude/skills/vercel-deployment`
  for why it can't just use the event payload's own URL (Deployment Protection).
  Correctly shows **"skipping"**, not failing, for Preview deployments — that's the
  intended behavior, not a bug.
- **`.github/workflows/auto-update-pr-branches.yml`** — on every push to `main`,
  merges `main` into every open PR branch via the REST API's `update-branch`
  endpoint (a real merge commit, never a force-push; cleanly no-ops if it'd
  conflict). Exists specifically because there's no branch protection to keep PR
  branches current automatically otherwise — confirmed this is a real problem, not
  theoretical: two open PRs stayed stuck on an *already-fixed* e2e bug purely because
  their branches hadn't picked up the fix yet.

## Checking CI status

`gh pr checks <N>` for a single PR, or loop over `gh pr list --state open --json
number --jq '.[].number'` for all of them. For a red check, `gh run view <run-id>
--log-failed` gets the actual failure — don't guess from the check name alone (a
stale `e2e-deploy-check` job name like "against deployed URL" instead of "against
production" is itself a signal the branch predates a fix to that workflow and just
needs updating from `main`, not a new investigation).

## Can't merge your own PRs

Confirmed directly, twice: Claude Code's own auto-mode classifier blocks both `gh pr
merge <N>` and `gh pr merge <N> --auto` on a PR Claude authored — specifically
because this repo has no required-review branch protection, so either action would
merge to `main` (and trigger a production deploy) with zero human review. This is
intentional, not a bug to route around. Open the PR, then stop and ask the user to
review/merge it, or to explicitly say they're waiving review for that one PR.

## Branch/PR workflow

Per the user's explicit instruction (2026-07-07 onward): feature branch + PR, not
direct pushes to `main`. `git checkout -b <descriptive-name>` → commit → `git push -u
origin <branch>` → `gh pr create`. A PR branch gets its own Vercel preview deployment
automatically (see `.claude/skills/vercel-deployment`), which is a real benefit of
this flow. Exception worth confirming case-by-case, not assuming: a genuinely urgent
production-down fix might justify going straight to `main`.
