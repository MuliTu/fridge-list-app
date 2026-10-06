---
name: "firebase-data-model"
description: "Reference the Firebase Realtime Database and Firestore schema, security rules, and read/write conventions used by fridge-list-app before adding or changing any data access code. Use when touching /groceries, /stock, /receipts, /categories, /admins, or the Firestore image collections."
---

# Firebase data access

Use database.rules.json, firestore.demo.rules and current typed domain contracts as
source references. The Firestore file covers only the isolated demo. Deployed rules are not verified by reading these files. Historical public
read/write rule snippets and email-admin conventions are obsolete guidance.

The app combines browser realtime reads with authenticated server commands. Grocery
and recipe server writes authorize current approved UID membership; Admin SDK access
bypasses client rules. Reject pending, revoked, anonymous and unrelated users. Viewers
may read/suggest but cannot save. Do not widen rules to make a failing client write work.

Inspect the relevant module and rules before changing a path; older root-level schemas
do not describe every list-scoped record. Preserve ownership, role checks and atomic
operation metadata. Confirm destructive changes with a clear user-facing scope.
Images use separate Firestore records; unsupported image operations must fail clearly.

Verify with synthetic Auth/RTDB/Firestore emulators and role-denial cases, following
docs/demo-setup.md. Never use live household data as test fixtures. No live rule change,
production migration or paid Firebase tier is authorized by this skill. Source behavior
and migration limitations are recorded in docs/plans/flagship-progress.md.
