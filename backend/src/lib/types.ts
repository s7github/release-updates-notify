/**
 * Wire types shared across services.
 *
 * These mirror docs/DATA_MODEL.md. The snake_case fields in `Software` are
 * inherited from the AI Studio app and kept deliberately — renaming them would
 * require a data migration for no functional gain.
 */

export const RELEASE_CATEGORIES = [
  'New Features',
  'Feature Updates',
  'Optimization/Tips',
  'Bug Fixes',
  'Security Patches',
  'Major Milestone Update',
] as const;

export type ReleaseCategory = (typeof RELEASE_CATEGORIES)[number];

export function isReleaseCategory(value: unknown): value is ReleaseCategory {
  return typeof value === 'string' &&
    (RELEASE_CATEGORIES as readonly string[]).includes(value);
}

export interface Software {
  id: string;
  name: string;
  slug?: string;
  type?: 'software' | 'topic';
  vendor?: string | null;
  website?: string | null;
  icon_url?: string | null;
  active?: boolean;
  github_url?: string | null;
  rss_url?: string | null;
  changelog_url?: string | null;
  suggested_priority?: string[] | null;
  /** Admin override, comma-separated. Wins over suggested_priority. */
  priority_order?: string | null;
  lastVersion?: string | null;
  lastReleaseDate?: string | null;
  lastCheck?: string | null;
  historyMaxCount?: number | null;
  historyMinDate?: string | null;
}

export interface ExtractedRelease {
  version: string;
  releaseDate: string | null;
  category: ReleaseCategory;
  summary: string;
  isGenuineUpdate: boolean;
  metadataLearnings?: MetadataLearnings | null;
}

export interface MetadataLearnings {
  vendor?: string | null;
  website?: string | null;
  github_url?: string | null;
  rss_url?: string | null;
  changelog_url?: string | null;
  logo_url?: string | null;
}

export interface DiscoveredSource {
  name: string;
  vendor: string | null;
  website: string | null;
  icon_url: string | null;
  type: 'software' | 'topic';
  github_url: string | null;
  rss_url: string | null;
  changelog_url: string | null;
  suggested_priority: string[];
}

/** Published to `poll-requests`. */
export interface PollRequestMessage {
  softwareId: string;
  taskId?: string;
  includeHistory?: boolean;
  requestedBy?: string;
}

/** Published to `release-published` — only for genuine updates (ADR-0008). */
export interface ReleasePublishedMessage {
  softwareId: string;
  softwareName: string;
  version: string;
  category: ReleaseCategory;
  summary: string;
  releaseId: string;
}

export type NotificationSettingKey =
  | 'notifyFeatures'
  | 'notifySecurity'
  | 'notifyFixes'
  | 'notifyOptimizations';

/**
 * Which preference gates each category.
 *
 * **Must match `NotificationSettings.allows` in the Android client**, which has
 * its own test pinning the same mapping. `null` means always send.
 */
export const CATEGORY_SETTING: Record<ReleaseCategory, NotificationSettingKey | null> = {
  'New Features': 'notifyFeatures',
  'Feature Updates': 'notifyFeatures',
  'Optimization/Tips': 'notifyOptimizations',
  'Bug Fixes': 'notifyFixes',
  'Security Patches': 'notifySecurity',
  'Major Milestone Update': null,
};
