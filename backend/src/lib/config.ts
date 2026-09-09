/**
 * Configuration, read once at startup and validated loudly.
 *
 * A service that boots with a missing config value and fails on the first
 * request is harder to debug than one that refuses to start. Cloud Run will
 * surface the crash immediately.
 */

export type ServiceName = 'api' | 'poller' | 'notifier';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See docs/SETUP.md.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  service: optional('SERVICE', 'api') as ServiceName,
  port: Number(optional('PORT', '8080')),
  projectId: optional('GOOGLE_CLOUD_PROJECT', ''),

  /** Firestore database id. The AI Studio project uses a named, non-default db. */
  firestoreDatabaseId: optional('FIRESTORE_DATABASE_ID', '(default)'),

  topics: {
    pollRequests: optional('TOPIC_POLL_REQUESTS', 'poll-requests'),
    releasePublished: optional('TOPIC_RELEASE_PUBLISHED', 'release-published'),
  },

  /**
   * Mounted from Secret Manager, never from the repo. This is the one genuine
   * secret in the system (docs/SECURITY.md).
   */
  geminiApiKey: () => required('GEMINI_API_KEY'),

  /** Raises the GitHub rate limit from 60/hr to 5,000/hr. Optional but wanted. */
  githubToken: process.env.GITHUB_TOKEN ?? '',

  model: optional('GEMINI_MODEL', 'gemini-2.0-flash'),

  limits: {
    /** Per-user discovery calls per hour. Discovery spends money. */
    discoveryPerUserPerHour: Number(optional('LIMIT_DISCOVERY_PER_HOUR', '10')),
    /** Per-user refresh enqueues per hour. */
    refreshPerUserPerHour: Number(optional('LIMIT_REFRESH_PER_HOUR', '30')),
    /** FCM multicast cap. Not configurable by us — it is the API's limit. */
    fcmBatchSize: 500,
    /** Firestore `whereIn` cap. Also not ours. */
    whereInBatchSize: 30,
    /** Bytes of scraped HTML handed to the model. */
    maxHtmlChars: 50_000,
    maxHistoryHtmlChars: 80_000,
  },
} as const;
