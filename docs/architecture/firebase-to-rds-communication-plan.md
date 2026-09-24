# Firebase to RDS Communication Plan

Use this if the production cutover requires user-visible downtime, write freeze, or admin notification.

## Audiences

- app owner/admin
- household app users, if user-visible
- engineering/operator
- support/contact person

## Communication Triggers

Send communication if:

- write freeze is planned
- downtime is expected
- rollback occurs
- data inconsistency affects users
- cutover succeeds and users should resume normal usage

## Pre-Cutover Message Template

```text
Subject: Fridge app maintenance window

We are performing database maintenance on <date/time>.

Expected impact:
- You may be unable to add or edit items during the maintenance window.
- Existing lists should remain safe.

Expected duration:
- <duration>

We will send an update when maintenance is complete.
```

## Freeze Start Template

```text
Maintenance has started.

Please avoid adding, editing, or deleting fridge list items until we send an all-clear.
```

## Success Template

```text
Maintenance is complete.

You can use the fridge app normally again.
```

## Rollback Template

```text
Maintenance is taking longer than expected, so we restored the previous database path.

You can use the fridge app normally while we investigate.
```

## Incident Template

```text
We found an issue during database maintenance and are investigating.

Please report any missing or incorrect list data directly to <contact>.
```

## Internal Operator Notes

Do not include:

- database URLs
- S3 paths
- credentials
- token values
- private implementation details

Do include:

- clear user impact
- expected duration
- whether users should stop writing
- all-clear status
