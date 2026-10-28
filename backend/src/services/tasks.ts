import { FieldValue } from 'firebase-admin/firestore';
import { Collections, db } from '../lib/firebase.js';
import { expiresAt, RETENTION_DAYS } from '../lib/retention.js';

/**
 * Pipeline job progress, written to `background_tasks`.
 *
 * The client reads these to show a real progress bar rather than an
 * indeterminate spinner. It cannot write them (ADR-0006) — letting a client
 * write progress means letting it lie.
 */

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type TaskType = 'initial_poll' | 'history_scrape' | 'metadata_enrichment';

export async function createTask(input: {
  type: TaskType;
  softwareId: string;
  softwareName: string;
  requestedBy?: string;
}): Promise<string> {
  const ref = await db().collection(Collections.BACKGROUND_TASKS).add({
    type: input.type,
    status: 'pending' satisfies TaskStatus,
    softwareId: input.softwareId,
    softwareName: input.softwareName,
    progress: 0,
    message: 'Queued',
    // Lets a user watch the job they asked for, and nobody else's.
    requestedBy: input.requestedBy ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    // Firestore TTL deletes the task after this; nobody reads one past a few weeks.
    expiresAt: expiresAt(RETENTION_DAYS.tasks),
  });
  return ref.id;
}

/**
 * Marks tasks that stopped making progress as failed.
 *
 * A job that exhausts its Pub/Sub retries is dead-lettered and never reports
 * again, so its task would sit at `processing` forever and the console would show
 * it as running. Run from the hourly sweep.
 */
export async function reapStuckTasks(olderThanMinutes = 30, limit = 200): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const snap = await db()
    .collection(Collections.BACKGROUND_TASKS)
    .where('status', 'in', ['pending', 'processing'])
    .where('updatedAt', '<', cutoff)
    .limit(limit)
    .get();
  if (snap.empty) return 0;

  const batch = db().batch();
  for (const doc of snap.docs) {
    batch.set(
      doc.ref,
      {
        status: 'failed' satisfies TaskStatus,
        error: 'Timed out',
        message: `No progress for ${olderThanMinutes} minutes; the job was abandoned.`,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();
  return snap.size;
}

export async function updateTask(
  taskId: string | undefined,
  update: {
    status?: TaskStatus;
    progress?: number;
    message?: string;
    error?: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  if (!taskId) return;
  await db()
    .collection(Collections.BACKGROUND_TASKS)
    .doc(taskId)
    .set({ ...update, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/** Progress reporter bound to one task. A no-op when there is no task. */
export function progressReporter(taskId?: string) {
  return async (progress: number, message: string, details?: Record<string, unknown>) => {
    await updateTask(taskId, {
      status: 'processing',
      progress: Math.max(0, Math.min(100, Math.round(progress))),
      message,
      ...(details ? { details } : {}),
    });
  };
}
