# Fridge contributor guide

Fridge is a Hebrew/English household grocery application built with React,
TypeScript, TanStack Start and Firebase. Its flagship slice turns explicitly selected
purchased inventory into reviewed recipe suggestions and explicitly saved recipes.

## Start here

- [Project overview and capability status](README.md)
- [Documentation index](docs/README.md)
- [Isolated synthetic setup](docs/demo-setup.md)
- [Product spec](docs/specs/spec-flagship-readiness.md), [implementation plan](docs/plans/plan-flagship-readiness.md), [tasks](docs/specs/tasks-flagship-readiness.md)
- [Dated verification evidence](docs/plans/flagship-progress.md)
- [Module boundaries](docs/architecture/module-boundaries.md)

The verification log distinguishes source implementation, local checks and remaining
release gates. Older specs are historical design inputs, not proof of deployed behavior.
Do not infer live Firebase rules, workflow state, credentials or production health
from source code or past conversations.

## Working conventions

Work in small reviewable tasks on a feature branch. Preserve unrelated local edits.
Use relevant repository skills, with the user's explicit scope taking precedence.
Run GitNexus impact before edits and applicable tests after them. Commit only when
requested; use a reviewed PR for integration and do not merge your own PR without
human review or an explicit waiver. Publication, deployment, history rewriting,
credential changes, paid services and production data changes require scoped approval.

Version changes belong to the approved release task; consult the release-bump skill.
Release notes use GitHub Releases. Do not publish a release merely because local tests
pass. TanStack Start APIs require a server runtime; a static file server is insufficient.

## Engineering contracts

- Keep provider SDKs and credentials server-side; use browser-safe module contracts.
- Authenticate and check current approved UID membership on every privileged action.
  Firebase Admin bypasses client rules, so application authorization is essential.
- AI proposes content. Deterministic validation controls inventory grounding, schema,
  authorization, call budgets and persistence. Users review mutations before approval.
- Preserve unknown nutrition values. Estimates need source/basis and explicit weights.
- Keep Hebrew RTL and English LTR behavior accessible at mobile/tablet/desktop widths.
- Use structured bounded diagnostics without names, emails, prompts, receipts or tokens.
- Start from synthetic emulator data. Optional integrations remain disabled in the
  isolated demo; live receiver authentication and failure behavior are unverified.
- Keep operational endpoints in server configuration, never examples or browser code.
  Knowing a URL is not authorization to invoke its workflow.

## Historical notes and privacy

[Design context](CONVERSATION.md) points to durable decisions. Private discussion,
contact details and deployment identifiers do not belong in contributor guidance.
Local cleanup does not remove earlier public commits or copies; see the
[external remediation proposal](docs/plans/external-remediation-proposal.md).

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **fridge-list-app** (3836 symbols, 9272 relationships, 318 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/fridge-list-app/context` | Codebase overview, check index freshness |
| `gitnexus://repo/fridge-list-app/clusters` | All functional areas |
| `gitnexus://repo/fridge-list-app/processes` | All execution flows |
| `gitnexus://repo/fridge-list-app/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
