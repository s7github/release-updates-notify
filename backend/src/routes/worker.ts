import express, { type Express } from 'express';
import { decodePubSubMessage, requirePubSubToken } from '../lib/auth.js';
import { log } from '../lib/logging.js';
import { captureException } from '../lib/sentry.js';
import { fanOutRelease } from '../services/notifier.js';
import { enqueueDuePolls, pollHistory, pollSoftware } from '../services/poller.js';
import { reapStuckTasks } from '../services/tasks.js';
import type { PollRequestMessage, ReleasePublishedMessage } from '../lib/types.js';

/**
 * Pub/Sub push endpoints for the `poller` and `notifier` services.
 *
 * **Status codes are the retry protocol here**, not decoration:
 *   2xx  → acknowledged, message deleted
 *   5xx  → redelivered with backoff, eventually dead-lettered
 *
 * So a malformed message must return 2xx (retrying will never fix it, and it
 * would loop until the dead-letter queue), while a transient failure must return
 * 5xx so it is retried.
 */

export function createPollerApp(): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'poller' }));

  app.post('/pubsub/poll', requirePubSubToken, async (req, res) => {
    const message = decodePubSubMessage<PollRequestMessage>(req.body);

    if (!message?.softwareId) {
      // Unparseable: acknowledge so it does not loop forever.
      log.warn('dropping malformed poll message');
      res.status(204).end();
      return;
    }

    try {
      if (message.includeHistory) {
        const count = await pollHistory(message.softwareId, { taskId: message.taskId });
        res.json({ softwareId: message.softwareId, historyCount: count });
      } else {
        const result = await pollSoftware(message.softwareId, {
          taskId: message.taskId,
          scheduled: message.scheduled === true,
          force: message.force === true,
        });
        res.json(result);
      }
    } catch (error) {
      captureException(error as Error, {
        softwareId: message.softwareId,
        taskId: message.taskId,
        operation: 'pollSoftware',
        service: 'poller',
      });
      log.error('poll failed', error, { softwareId: message.softwareId });
      // 5xx so Pub/Sub retries with backoff. A vendor site being down for an
      // hour then costs nothing and loses no jobs.
      res.status(500).json({ error: 'Poll failed' });
    }
  });

  /** Cloud Scheduler entry point: enqueue everything due. */
  app.post('/scheduler/sweep', requirePubSubToken, async (req, res) => {
    // Absent means adaptive: each product is polled at its own pace.
    const raw = (req.body as { olderThanMinutes?: unknown })?.olderThanMinutes;
    const minutes = raw === undefined ? undefined : Number(raw);
    try {
      const count = await enqueueDuePolls(
        minutes !== undefined && Number.isFinite(minutes) && minutes > 0 ? minutes : undefined,
      );
      // Jobs that were dead-lettered never report again; close their tasks.
      const reaped = await reapStuckTasks().catch((error) => {
        log.warn('task reaper failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        return 0;
      });
      res.json({ enqueued: count, reaped });
    } catch (error) {
      captureException(error as Error, {
        operation: 'enqueueDuePolls',
        service: 'poller',
      });
      log.error('sweep failed', error);
      res.status(500).json({ error: 'Sweep failed' });
    }
  });

  return app;
}

export function createNotifierApp(): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'notifier' }));

  app.post('/pubsub/notify', requirePubSubToken, async (req, res) => {
    const message = decodePubSubMessage<ReleasePublishedMessage>(req.body);

    if (!message?.softwareId || !message.version) {
      log.warn('dropping malformed release message');
      res.status(204).end();
      return;
    }

    try {
      const result = await fanOutRelease(message);
      res.json(result);
    } catch (error) {
      captureException(error as Error, {
        softwareId: message.softwareId,
        version: message.version,
        operation: 'fanOutRelease',
        service: 'notifier',
      });
      log.error('fan-out failed', error, { softwareId: message.softwareId });
      res.status(500).json({ error: 'Fan-out failed' });
    }
  });

  return app;
}
