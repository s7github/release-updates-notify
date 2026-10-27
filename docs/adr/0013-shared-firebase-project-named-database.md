# ADR-0013: Run in the shared `trend-equity` Firebase project, in a named database

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

Production pointed at an AI Studio scratch project (`gen-lang-client-0040242541`).
The owner chose to move to the existing `trend-equity` Firebase project
(`gen-lang-client-0099813375`) instead of creating a new one.

That project already serves another live app. Firestore has exactly one rules
file per database, and both apps keep a `users/{uid}` collection with different
shapes. Deploying this app's rules to the `(default)` database would have replaced
the other app's rules and mixed two schemas in one collection.

## Decision

This app uses its own **named Firestore database, `updatenotify`**, in
`gen-lang-client-0099813375` (region `europe-west4`). The `(default)` database
and its rules belong to the other app and are never deployed from this repo.

- `firebase/firebase.json` deploys rules and indexes to `database: updatenotify`
  only.
- Web: `firestoreDatabaseId` in `web/firebase-applet-config.json`.
- Backend: `FIRESTORE_DATABASE_ID=updatenotify` (and `GOOGLE_CLOUD_PROJECT`).
- Android: `NetworkModule` opens the named database explicitly.
- Firebase Auth is per project, so both apps share one user pool. A user of one
  app has an account in the other but no data access there.
- A dedicated web app (`updatenotify-web`) is registered in the project.

## Consequences

- No change to the other app's data or rules. Verified: its `cloud.firestore`
  release was untouched by the deploy.
- Authorised domains and sign-in providers are shared; adding this app's domains
  affects both.
- Existing data in the old AI Studio database is not migrated automatically.
- Anyone with project-level Firestore IAM can reach both databases. Use
  per-database IAM conditions if that matters.
