# Firebase Export and Backup Procedure

This runbook defines how to save existing Firebase data before any RDS import or production cutover.

Do not run this against production until the backup bucket, IAM access, retention, and operator are approved.

## Scope

Export and preserve:

- Firebase Realtime Database:
  - `/users`
  - `/whats_new`
  - `/feedbacks`
  - `/identityBindings`, if present
- Firestore image collections:
  - `receiptImages`
  - `groceryImages`

Firebase Auth users are not migrated in phase 1 because Firebase Auth remains the identity provider.

## Required Decisions

- [ ] AWS account for backup storage.
- [ ] S3 bucket name.
- [ ] S3 region.
- [ ] KMS key or S3-managed encryption policy.
- [ ] IAM role/user allowed to write backups.
- [ ] IAM role/user allowed to read backups.
- [ ] Retention period.
- [ ] Production export operator.
- [ ] Rollback owner.
- [ ] Backup recovery/test operator.
- [ ] Firestore image backup or deferral sign-off.

## Recommended S3 Layout

```text
s3://<private-backup-bucket>/firebase-rtdb/YYYY-MM-DD/raw/full-export.json
s3://<private-backup-bucket>/firebase-rtdb/YYYY-MM-DD/raw/full-export.sha256
s3://<private-backup-bucket>/firebase-rtdb/YYYY-MM-DD/metadata/export-metadata.json
s3://<private-backup-bucket>/firebase-rtdb/YYYY-MM-DD/normalized/
s3://<private-backup-bucket>/firebase-rtdb/YYYY-MM-DD/verification/

s3://<private-backup-bucket>/firebase-firestore/YYYY-MM-DD/raw/receiptImages/
s3://<private-backup-bucket>/firebase-firestore/YYYY-MM-DD/raw/groceryImages/
s3://<private-backup-bucket>/firebase-firestore/YYYY-MM-DD/metadata/export-metadata.json
```

## Export Metadata

Store this metadata with every export:

```json
{
  "source": "firebase",
  "environment": "production",
  "firebaseProjectId": "<project-id>",
  "firebaseDatabaseUrl": "<database-url>",
  "exportedAt": "<iso timestamp>",
  "gitBranch": "migrate-to-aws",
  "gitCommit": "<commit sha>",
    "operator": "<name>",
    "rtdbSha256": "<sha256>",
    "freezeStartedAt": "<iso timestamp or null>",
    "lastAcceptedFirebaseWriteAt": "<iso timestamp or null>",
    "topLevelCounts": {
      "users": 0,
      "whats_new": 0,
      "feedbacks": 0,
      "identityBindings": 0
    },
    "notes": []
  }
```

Do not include service account JSON, Firebase ID tokens, database credentials, or user secrets in metadata.

## Realtime Database Export Options

### Option A: Firebase Console

Use this when a human operator is performing a one-time production-safe export.

1. Open Firebase Console.
2. Select the production project.
3. Go to Realtime Database.
4. Use the export/download JSON option for the full database.
5. Save the file as:

```text
full-export.json
```

6. Compute a checksum locally:

```bash
shasum -a 256 full-export.json > full-export.sha256
```

7. Upload the JSON, checksum, and metadata to the approved S3 location.

### Option B: Firebase Admin Script

Use this only after the script is reviewed and run from a secure machine with production credentials.

Requirements:

- `FIREBASE_DATABASE_URL`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- no logs of credential values
- output written outside the repo or to an ignored local backup directory

The script should:

- initialize Firebase Admin server-side only
- read the database root once
- write JSON to a timestamped local file
- produce a SHA-256 checksum
- never transform the raw export in place

## Firestore Image Export

Firestore image documents are deferred from phase 1 but must be backed up before Firebase cleanup.

Collections:

- `receiptImages`
- `groceryImages`

Each document currently stores data similar to:

```json
{
  "data": "<base64>",
  "contentType": "<mime type>",
  "uploaded_at": "<iso timestamp>"
}
```

Export rules:

- Keep original document IDs.
- Store each collection separately.
- Store checksums for exported files.
- Do not decode or transform base64 in the raw export.

## Upload Requirements

The backup bucket must have:

- [ ] public access blocked
- [ ] server-side encryption enabled
- [ ] versioning enabled
- [ ] least-privilege IAM
- [ ] retention/lifecycle policy
- [ ] access logging or audit trail
- [ ] Object Lock or equivalent accidental-delete protection, if available
- [ ] tested recovery role with read access
- [ ] documented lifecycle/retention owner

Suggested upload shape:

```bash
aws s3 cp full-export.json s3://<private-backup-bucket>/firebase-rtdb/YYYY-MM-DD/raw/full-export.json
aws s3 cp full-export.sha256 s3://<private-backup-bucket>/firebase-rtdb/YYYY-MM-DD/raw/full-export.sha256
aws s3 cp export-metadata.json s3://<private-backup-bucket>/firebase-rtdb/YYYY-MM-DD/metadata/export-metadata.json
```

Do not run these commands until the bucket and operator are approved.

## Verification After Export

- [ ] Raw export exists in S3.
- [ ] Checksum file exists in S3.
- [ ] Metadata file exists in S3.
- [ ] S3 object encryption is enabled.
- [ ] S3 object is private.
- [ ] Export can be downloaded by the approved recovery role.
- [ ] Checksum matches after download.
- [ ] Firebase production remains untouched.
- [ ] top-level paths expected for scope are present.
- [ ] source object counts are recorded in metadata.
- [ ] object size is within expected range or has named approval.
- [ ] sample records can be read from the downloaded export.
- [ ] no production export content appears in logs, reports, or the repository.

## Firestore Image Backup Decision

Choose one before production cutover:

- [ ] Back up Firestore image collections before cutover.
- [ ] Defer Firestore image backup with named product/engineering sign-off, a cleanup block, and a later backup deadline.

Do not delete Firestore image data or remove image code until the selected decision is complete.

## Verification After Import To RDS

Run verification in staging before production:

- [ ] count household lists
- [ ] count members and invites
- [ ] count groceries
- [ ] count categories
- [ ] count stock items
- [ ] count receipts
- [ ] count receipt line items
- [ ] count purchase events
- [ ] count feedback records
- [ ] verify orphan rows
- [ ] sample known production lists
- [ ] compare owner/member access results

## Rollback Rule

Keep Firebase Realtime Database untouched or read-only through the rollback window.

Do not delete Firebase data, remove rules, or disable the database until:

- [ ] production RDS verification passes
- [ ] rollback window closes
- [ ] product/engineering signs off
- [ ] final RDS snapshot exists
