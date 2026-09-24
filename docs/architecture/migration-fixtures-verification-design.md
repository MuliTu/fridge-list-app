# Migration Fixtures and Verification Design

This design prepares `RDS-042` through `RDS-046`. It is docs-only preparation for migration tooling.

## Objectives

- Define representative Firebase export fixtures.
- Define raw-to-normalized transform outputs.
- Define verification reports that catch data loss before production cutover.
- Keep migration tooling idempotent and resumable.

## Fixture Directory Proposal

```text
scripts/migration/fixtures/firebase-export.minimal.json
scripts/migration/fixtures/firebase-export.household-with-members.json
scripts/migration/fixtures/firebase-export.receipts-stock-feedback.json
scripts/migration/fixtures/expected-normalized.minimal.json
scripts/migration/fixtures/expected-normalized.household-with-members.json
scripts/migration/fixtures/expected-normalized.receipts-stock-feedback.json
```

Do not store production exports in the repository.

## Minimal Firebase Fixture Shape

```json
{
  "users": {
    "owner_example_com": {
      "ownerUid": "uid-owner",
      "normalizedOwnerEmail": "owner@example.com",
      "name": "הרשימה שלי",
      "config": {
        "onboardingDismissed": true,
        "keepBoughtItemsInCategories": false
      },
      "groceries": {
        "-firebase-grocery": {
          "item": "Milk",
          "category": "Dairy",
          "bought": false,
          "added_at": "2026-09-23T00:00:00.000Z",
          "raw_text": "נוסף ידנית",
          "created_by": "owner@example.com",
          "list_name": null,
          "quantity": 1,
          "unit": "liter"
        }
      },
      "categories": {
        "dairy": {
          "name": "Dairy",
          "color": "#ffffff",
          "icon": "milk",
          "protected": false,
          "order": 1
        }
      }
    }
  },
  "whats_new": {
    "version": "1.0.0",
    "updates": ["Example update"]
  }
}
```

## Required Fixture Cases

- owner-only list
- list with approved member
- list with pending invite
- list with config
- groceries with quantity/unit/nulls
- bought and unbought groceries
- category order and protected values
- stock with low threshold
- purchase history append-only events
- receipt with multiple items
- receipt with unsafe/missing source URL
- feedback with nested error
- feedback with nested ticket
- whats-new global content
- old Firebase root missing `ownerUid` and `normalizedOwnerEmail`
- identity binding present
- identity binding absent

## Normalized Output Shape

Use one JSON object grouped by RDS table name:

```json
{
  "household_lists": [],
  "user_configs": [],
  "household_members": [],
  "household_invites": [],
  "identity_bindings": [],
  "grocery_items": [],
  "categories": [],
  "stock_items": [],
  "purchase_events": [],
  "receipts": [],
  "receipt_line_items": [],
  "whats_new": [],
  "feedback_records": []
}
```

This gives transform tests a stable target before writing to RDS.

## Transform Rules

General:

- preserve Firebase keys as IDs when importing existing records
- generate deterministic IDs for receipt line items from receipt ID and position
- convert snake_case Firebase fields to camelCase Prisma fields
- convert absent optional fields to null when app semantics expect null
- keep raw export immutable

Lists:

- if `ownerUid` exists, use it
- if `normalizedOwnerEmail` exists, use it
- if missing, derive normalized owner email from Firebase path only when reversible or from identity binding when available
- otherwise classify as blocking migration issue

Members/invites:

- approved members become `HouseholdMember(status=Approved)`
- pending invite/member records become `HouseholdInvite(status=Pending)` and should not grant list access unless product changes the rule

Receipts:

- create one `Receipt`
- create one `ReceiptLineItem` per embedded item
- preserve array order as `position`
- import `price` and `total` as decimal-safe strings or Decimal values

Feedback:

- flatten `error.message` -> `errorMessage`
- flatten `error.detail` -> `errorDetail`
- flatten `ticket.id/url/title` -> `ticketId/ticketUrl/ticketTitle`

## Verification Report

Output:

```text
verification-report.json
verification-report.md
```

Required sections:

- source export metadata
- transform version
- table counts
- skipped records
- blocking records
- warnings
- orphan checks
- sample list checks
- authorization comparison checks

Required count checks:

- household lists
- user configs
- members
- invites
- identity bindings
- groceries
- categories
- stock items
- purchase events
- receipts
- receipt line items
- whats-new records
- feedback records

Required orphan checks:

- grocery without list
- category without list
- stock item without list
- receipt without list
- receipt line item without receipt
- purchase event without list
- member without list
- invite without list
- config without list

Required data quality checks:

- missing list owner UID
- missing normalized owner email
- duplicate category name per list
- duplicate stock item name per list
- receipt item without name or price
- grocery without item/category
- feedback without message

## Idempotency

Import scripts must be safe to rerun against a clean or partially imported staging database.

Recommended behavior:

- use deterministic IDs for imported records
- upsert by primary key
- do not duplicate child records
- write import run metadata
- support `--dry-run`
- support `--list-id <id>` for focused retries

## Commands To Design Later

```bash
npm run migration:normalize -- --input firebase-export.json --output normalized.json
npm run migration:verify -- --input firebase-export.json --normalized normalized.json
npm run migration:import -- --normalized normalized.json --database-url "$DATABASE_URL"
npm run migration:report -- --run-id <id>
```

Do not implement these until gates are accepted.

## Exit Criteria

- Fixture format is agreed.
- Fixture cases cover known data-shape risks.
- Verification report format is agreed.
- Transform rules are explicit enough to implement.
- Production exports remain outside the repository.
