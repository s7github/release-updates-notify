import { FieldValue } from 'firebase-admin/firestore';
import { config } from '../lib/config.js';
import { Collections, db, messaging } from '../lib/firebase.js';
import { log } from '../lib/logging.js';
import { CATEGORY_SETTING, type ReleasePublishedMessage } from '../lib/types.js';

/**
 * Notification fan-out (ADR-0008).
 *
 * A separate service from the poller on purpose: scraping is slow, bursty and
 * failure-prone, while sending is fast and latency-sensitive. Sharing an
 * autoscaler would tune for neither, and a partial failure mid-fan-out would
 * have no clean retry point — retrying the message would re-scrape and
 * re-extract, spending money to redo work that already succeeded.
 *
 * By the time a message reaches here, the poller has already applied the
 * genuine-update gate. This service does not second-guess it.
 */

export interface FanOutResult {
  softwareId: string;
  subscribers: number;
  eligible: number;
  sent: number;
  prunedTokens: number;
}

export async function fanOutRelease(
  message: ReleasePublishedMessage,
): Promise<FanOutResult> {
  const { softwareId, category } = message;

  // Indexed on softwareId — see firebase/firestore.indexes.json. Without that
  // index this is a collection scan on the hottest path in the system.
  const interests = await db()
    .collection(Collections.INTERESTS)
    .where('softwareId', '==', softwareId)
    .get();

  const userIds = [
    ...new Set(
      interests.docs
        // `following: false` means tracked but silent — a real state, not an
        // absence of one.
        .filter((doc) => doc.get('following') === true)
        .map((doc) => String(doc.get('userId') ?? ''))
        .filter(Boolean),
    ),
  ];

  if (userIds.length === 0) {
    return { softwareId, subscribers: 0, eligible: 0, sent: 0, prunedTokens: 0 };
  }

  const settingKey = CATEGORY_SETTING[category];
  const tokensByUser = new Map<string, string[]>();

  // Firestore caps `whereIn` at 30 values, so subscriber lookup is chunked.
  for (let i = 0; i < userIds.length; i += config.limits.whereInBatchSize) {
    const chunk = userIds.slice(i, i + config.limits.whereInBatchSize);
    const users = await db()
      .collection(Collections.USERS)
      .where('uid', 'in', chunk)
      .get();

    for (const doc of users.docs) {
      // Preferences are applied HERE, before sending. A muted category never
      // reaches the device, so it costs no battery and cannot flash on screen
      // before being suppressed locally.
      if (settingKey) {
        const settings = (doc.get('settings') ?? {}) as Record<string, unknown>;
        // Default true: a user who has never touched settings gets everything.
        if (settings[settingKey] === false) continue;
      }

      const tokens = (doc.get('fcmTokens') ?? []) as unknown;
      if (!Array.isArray(tokens) || tokens.length === 0) continue;
      tokensByUser.set(doc.id, tokens.filter((t): t is string => typeof t === 'string'));
    }
  }

  const allTokens = [...tokensByUser.values()].flat();
  if (allTokens.length === 0) {
    return {
      softwareId,
      subscribers: userIds.length,
      eligible: tokensByUser.size,
      sent: 0,
      prunedTokens: 0,
    };
  }

  let sent = 0;
  const deadTokens: string[] = [];

  for (let i = 0; i < allTokens.length; i += config.limits.fcmBatchSize) {
    const batch = allTokens.slice(i, i + config.limits.fcmBatchSize);

    const response = await messaging().sendEachForMulticast({
      tokens: batch,
      // Data-only, deliberately: no `notification` block. The client builds the
      // notification so the category can select the right channel, which a
      // server-composed notification cannot do.
      data: {
        softwareId: message.softwareId,
        softwareName: message.softwareName,
        version: message.version,
        category: message.category,
        summary: message.summary.slice(0, 500),
        releaseId: message.releaseId,
      },
      android: {
        priority: category === 'Security Patches' || category === 'Major Milestone Update'
          ? 'high'
          : 'normal',
        // Undelivered after 24h means the news is stale; drop rather than
        // waking a phone that has been off for a week.
        ttl: 24 * 60 * 60 * 1000,
      },
    });

    sent += response.successCount;

    response.responses.forEach((result, index) => {
      if (result.success) return;
      const code = result.error?.code ?? '';
      // Tokens die constantly — reinstalls, cache clears, uninstalls. Unpruned
      // they accumulate forever and every send gets slower and more expensive.
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-registration-token') ||
        code.includes('invalid-argument')
      ) {
        const token = batch[index];
        if (token) deadTokens.push(token);
      } else {
        log.warn('fcm send failed', { code, softwareId });
      }
    });
  }

  await pruneTokens(tokensByUser, deadTokens);

  const result: FanOutResult = {
    softwareId,
    subscribers: userIds.length,
    eligible: tokensByUser.size,
    sent,
    prunedTokens: deadTokens.length,
  };
  log.info('fan-out complete', { ...result, version: message.version });
  return result;
}

async function pruneTokens(
  tokensByUser: Map<string, string[]>,
  deadTokens: string[],
): Promise<void> {
  if (deadTokens.length === 0) return;
  const dead = new Set(deadTokens);

  await Promise.all(
    [...tokensByUser.entries()].map(async ([uid, tokens]) => {
      const theirs = tokens.filter((t) => dead.has(t));
      if (theirs.length === 0) return;
      // arrayRemove rather than a rewrite, so a device registering concurrently
      // is not clobbered.
      await db()
        .collection(Collections.USERS)
        .doc(uid)
        .update({ fcmTokens: FieldValue.arrayRemove(...theirs) })
        .catch((error) => log.warn('token prune failed', { uid, error: String(error) }));
    }),
  );
}
