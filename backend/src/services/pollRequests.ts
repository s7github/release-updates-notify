import { PubSub } from '@google-cloud/pubsub';
import { config } from '../lib/config.js';
import type { PollRequestMessage } from '../lib/types.js';
import { createTask, updateTask } from './tasks.js';

/**
 * The one place that turns "please poll this" into a task document plus a
 * Pub/Sub message. Both the user-facing `api` routes and the admin routes use
 * it, so the two paths cannot drift in task shape or topic name.
 */

let pubsub: PubSub | undefined;

function client(): PubSub {
  if (!pubsub) pubsub = new PubSub();
  return pubsub;
}

export async function enqueuePoll(input: {
  softwareId: string;
  softwareName: string;
  requestedBy?: string;
  includeHistory?: boolean;
  force?: boolean;
  scheduled?: boolean;
  taskType?: 'initial_poll' | 'history_scrape';
}): Promise<string> {
  const taskId = await createTask({
    type: input.taskType ?? (input.includeHistory ? 'history_scrape' : 'initial_poll'),
    softwareId: input.softwareId,
    softwareName: input.softwareName,
    requestedBy: input.requestedBy,
  });

  const message: PollRequestMessage = {
    softwareId: input.softwareId,
    taskId,
    includeHistory: input.includeHistory === true,
    force: input.force === true,
    scheduled: input.scheduled === true,
    requestedBy: input.requestedBy,
  };

  try {
    await client().topic(config.topics.pollRequests).publishMessage({ json: message });
  } catch (error) {
    // Do not leave a permanently `pending` task behind when the queue is
    // unreachable. The caller still sees the failure.
    await updateTask(taskId, {
      status: 'failed',
      message: 'Could not enqueue the job',
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
    throw error;
  }
  return taskId;
}
