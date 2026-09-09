import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { config } from './config.js';

/**
 * Firebase Admin SDK singletons.
 *
 * The Admin SDK **bypasses Firestore security rules entirely**. That is the
 * whole point: the client is denied write access to master_registry,
 * release_notes and background_tasks (ADR-0006), and these services are what
 * writes them.
 *
 * It also means a bug here has no safety net. Every write below should be one
 * this service is genuinely responsible for.
 */

let firestore: Firestore | undefined;

function app() {
  const existing = getApps()[0];
  if (existing) return existing;
  // Application Default Credentials: the Cloud Run service account in
  // production, `gcloud auth application-default login` locally. No key file.
  return initializeApp({ credential: applicationDefault() });
}

export function db(): Firestore {
  if (!firestore) {
    firestore = config.firestoreDatabaseId === '(default)'
      ? getFirestore(app())
      : getFirestore(app(), config.firestoreDatabaseId);
    firestore.settings({ ignoreUndefinedProperties: true });
  }
  return firestore;
}

export function messaging(): Messaging {
  return getMessaging(app());
}

export function auth(): Auth {
  return getAuth(app());
}

export const Collections = {
  USERS: 'users',
  INTERESTS: 'interests',
  MASTER_REGISTRY: 'master_registry',
  RELEASE_NOTES: 'release_notes',
  BACKGROUND_TASKS: 'background_tasks',
  SYSTEM_LEARNINGS: 'system_learnings',
  ADMINS: 'admins',
} as const;
