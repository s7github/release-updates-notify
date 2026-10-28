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

  model: optional('GEMINI_MODEL', 'gemini-3.8-flash'),

  /**
   * When a release is found from structured sources, ask the model to polish the
   * summary and category. Detection never depends on it; set to `false` to run
   * with no model calls on the scheduled path at all (ADR-0017).
   */
  aiSummaries: optional('AI_SUMMARIES', 'true') !== 'false',

  limits: {
    /** FCM multicast cap. Not configurable by us — it is the API's limit. */
    fcmBatchSize: 500,
    /** Firestore `whereIn` cap. Also not ours. */
    whereInBatchSize: 30,
    /** Bytes of scraped HTML handed to the model. */
    maxHtmlChars: 50_000,
    maxHistoryHtmlChars: 80_000,
  },
} as const;
