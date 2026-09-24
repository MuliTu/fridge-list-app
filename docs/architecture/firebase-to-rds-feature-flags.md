# Firebase to RDS Feature Flags

This matrix defines the proposed flags/config switches for staging rollout and production safety. Presence of `DATABASE_URL` must never enable RDS behavior by itself.

## Principles

- Production defaults are off.
- Flags are server-evaluated unless explicitly marked client-safe.
- Browser-visible flags must not reveal secrets or infrastructure details.
- Each flag has a rollback action.
- Each flag must be documented in the PR that introduces it.

## Proposed Flags

| Flag | Scope | Default | Purpose | Rollback |
| --- | --- | --- | --- | --- |
| `RDS_ENABLED` | server | `false` | Master kill switch for all RDS-backed app data paths | Set `false` |
| `RDS_LIST_AUTH_ENABLED` | server | `false` | Use RDS-backed list authorization adapter | Set `false` and keep Firebase/fail-closed path |
| `RDS_GROCERY_READS_ENABLED` | server/client-safe derived capability | `false` | Use RDS-backed grocery read endpoint/feed | Set `false` to use Firebase `onValue` |
| `RDS_GROCERY_WRITES_ENABLED` | server/client-safe derived capability | `false` | Use RDS-backed grocery write repository/API | Set `false` to use Firebase-backed repository/path |
| `RDS_CATEGORIES_ENABLED` | server/client-safe derived capability | `false` | Use RDS-backed categories | Set `false` |
| `RDS_STOCK_ENABLED` | server/client-safe derived capability | `false` | Use RDS-backed stock | Set `false` |
| `RDS_RECEIPTS_ENABLED` | server/client-safe derived capability | `false` | Use RDS-backed receipts metadata/line items | Set `false` |
| `RDS_PURCHASE_HISTORY_ENABLED` | server/client-safe derived capability | `false` | Use RDS-backed purchase events/insights | Set `false` |
| `RDS_FEEDBACK_ENABLED` | server | `false` | Use RDS-backed feedback records/retry worker | Set `false` |
| `RDS_WHATS_NEW_ENABLED` | server/client-safe derived capability | `false` | Use RDS-backed whats-new content | Set `false` |
| `RDS_MIGRATION_TOOLS_ENABLED` | server/CLI only | `false` | Permit migration import/export tooling outside production runtime | Set `false` |

## Client Exposure Rule

Do not expose raw server flags directly to the browser. If the UI needs to know which data source to use, expose a narrow capability response from an authenticated endpoint, for example:

```json
{
  "groceries": {
    "reads": "rds",
    "writes": "firebase"
  }
}
```

The endpoint must not expose database URLs, project IDs, credentials, or internal hostnames.

## Recommended Staging Rollout Order

1. `RDS_ENABLED=true`
2. `RDS_LIST_AUTH_ENABLED=true`
3. `RDS_GROCERY_WRITES_ENABLED=true`
4. `RDS_GROCERY_READS_ENABLED=true`
5. `RDS_CATEGORIES_ENABLED=true`
6. `RDS_STOCK_ENABLED=true`
7. `RDS_RECEIPTS_ENABLED=true`
8. `RDS_PURCHASE_HISTORY_ENABLED=true`
9. `RDS_WHATS_NEW_ENABLED=true`
10. `RDS_FEEDBACK_ENABLED=true`

Do not enable production flags until staging verification and gate sign-off.

## Production Cutover Rule

Before enabling any production RDS flag:

- [ ] Firebase export exists in approved backup location.
- [ ] RDS import has passed verification.
- [ ] rollback flag path is tested.
- [ ] on-call owner is assigned.
- [ ] user-visible write freeze or dual-write policy is active, if required.

## Kill Switch

`RDS_ENABLED=false` must disable all RDS-backed app data paths, regardless of individual flag values.

Production code should evaluate flags like:

```text
isRdsCapabilityEnabled = RDS_ENABLED && RDS_<DOMAIN>_ENABLED
```

## Observability

When an RDS flag is enabled, log structured events for:

- data source selected
- authorization denied
- persistence error
- migration fallback
- query timeout
- rollback switch observed

Logs must not include credentials, tokens, full backup paths with sensitive bucket names, or large user payloads.
