import express, { type Express } from 'express';
import { decodePubSubMessage, requirePubSubToken } from '../lib/auth.js';
import { log } from '../lib/logging.js';
import { fanOutRelease } from '../services/notifier.js';
import { enqueueDuePolls, pollHistory, pollSoftware } from '../services/poller.js';
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
        const result = await pollSoftware(message.softwareId, { taskId: message.taskId });
        res.json(result);
      }
    } catch (error) {
      log.error('poll failed', error, { softwareId: message.softwareId });
      // 5xx so Pub/Sub retries with backoff. A vendor site being down for an
      // hour then costs nothing and loses no jobs.
      res.status(500).json({ error: 'Poll failed' });
    }
  });

  /** Cloud Scheduler entry point: enqueue everything due. */
  app.post('/scheduler/sweep', requirePubSubToken, async (req, res) => {
    const minutes = Number((req.body as { olderThanMinutes?: unknown })?.olderThanMinutes ?? 360);
    try {
      const count = await enqueueDuePolls(minutes);
      res.json({ enqueued: count });
    } catch (error) {
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
      log.error('fan-out failed', error, { softwareId: message.softwareId });
      res.status(500).json({ error: 'Fan-out failed' });
    }
  });

  return app;
}
