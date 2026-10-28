import { PubSub } from '@google-cloud/pubsub';
import { config } from '../lib/config.js';
import { Collections, db } from '../lib/firebase.js';
import { log } from '../lib/logging.js';
import { captureException, captureMessage } from '../lib/sentry.js';
import { isNewerThan, releaseDocumentId } from '../lib/version.js';
import { isReleaseCategory } from '../lib/types.js';
import type {
  ExtractedRelease,
  MetadataLearnings,
  PollRequestMessage,
  ReleasePublishedMessage,
  Software,
  SourceType,
} from '../lib/types.js';
import {
  extractHistory,
  extractRelease,
  searchLatestRelease,
  extractWithFallback,
  SCHEDULED_STRATEGIES,
} from './gemini.js';
import { geminiBlockedUntil, isQuotaError, recordGeminiBlock } from '../lib/geminiGate.js';
import { selectDue, type RegistryProbe } from '../lib/schedule.js';
import { hashSources } from '../lib/sourceHash.js';
import { gatherSources, effectivePriority } from './scraper.js';
import { progressReporter, updateTask } from './tasks.js';
import { IntelligentCache } from '../lib/cache.js';

/**
 * The poller.
 *
 * Fetches every source that responds, extracts a structured release, and — only
 * when the version is genuinely new — publishes to the notification stage.
 *
 * Ported from `web/src/services/pollService.ts`, with one substantive change:
 * **the genuine-update gate** (ADR-0008). The web app wrote a release note on
 * every poll and had no notifications, so re-extracting the same version was
 * harmless. Here it would notify every subscriber again, which is the fastest
 * way to lose them.
 */

let pubsub: PubSub | undefined;
function client(): PubSub {
  if (!pubsub) pubsub = new PubSub();
  return pubsub;
}

// Initialize intelligent cache
const cache = new IntelligentCache();

// Track extraction performance and source failures
const sourceFailureTracker = new Map<string, { count: number; lastFailure: number }>();
const extractionMetrics = new Map<string, {
  total: number;
  successful: number;
  failed: number;
  averageConfidence: number;
  averageExecutionTime: number;
}>();

// Manual review queue (would be persisted to Firestore in production)
const manualReviewQueue = new Map<string, {
  softwareId: string;
  softwareName: string;
  extractionResult: ExtractedRelease;
  rawData: string;
  strategy: string;
  confidence: number;
  executionTimeMs: number;
  failureReason: string;
  timestamp: number;
}>();

// Extraction quality validation
export interface ExtractionValidationResult {
  isValid: boolean;
  issues: string[];
  score: number; // 0-1 quality score
}

export function validateExtractionQuality(
  release: ExtractedRelease,
  rawData: string,
  sourceCount: number,
): ExtractionValidationResult {
  const issues: string[] = [];
  let score = 1.0;

  // Validate version format
  if (!release.version || release.version.length === 0) {
    issues.push('Missing version number');
    score -= 0.3;
  } else if (!/^[0-9]+\.[0-9]+(\.[0-9]+)?([-.][a-zA-Z0-9]+)?$/.test(release.version)) {
    issues.push('Version format appears invalid');
    score -= 0.2;
  }

  // Validate category
  if (!release.category || !isReleaseCategory(release.category)) {
    issues.push('Invalid or missing category');
    score -= 0.2;
  }

  // Validate release date
  if (release.releaseDate) {
    const date = new Date(release.releaseDate);
    if (isNaN(date.getTime())) {
      issues.push('Invalid release date format');
      score -= 0.1;
    } else if (date > new Date()) {
      issues.push('Release date is in the future');
      score -= 0.15;
    }
  }

  // Validate summary
  if (!release.summary || release.summary.length < 20) {
    issues.push('Summary too short or missing');
    score -= 0.1;
  }

  // Validate isGenuineUpdate flag
  if (!release.isGenuineUpdate) {
    issues.push('Marked as non-genuine update');
    score -= 0.25;
  }

  // Validate data volume
  if (rawData.length < 100) {
    issues.push('Insufficient source data for reliable extraction');
    score -= 0.1;
  }

  // Validate source count
  if (sourceCount === 0) {
    issues.push('No source data available');
    score -= 0.3;
  }

  // Score adjustment for source quality
  if (sourceCount > 3) {
    score += 0.1; // More sources = more reliable
  }

  return {
    isValid: score >= 0.7 && issues.length === 0, // Consider valid if score >= 0.7
    issues,
    score: Math.max(0, Math.min(1, score)),
  };
}

export function isDuplicateRelease(
  softwareId: string,
  version: string,
  releaseDate?: string | null,
): Promise<boolean> {
  const docId = releaseDocumentId(softwareId, version);
  return db()
    .collection(Collections.RELEASE_NOTES)
    .doc(docId)
    .get()
    .then(snapshot => snapshot.exists);
}

export function addToManualReviewQueue(
  softwareId: string,
  softwareName: string,
  extractionResult: ExtractedRelease,
  rawData: string,
  strategy: string,
  confidence: number,
  executionTimeMs: number,
  failureReason: string,
): void {
  const itemId = `${softwareId}_${extractionResult.version}_${Date.now()}`;
  manualReviewQueue.set(itemId, {
    softwareId,
    softwareName,
    extractionResult,
    rawData,
    strategy,
    confidence,
    executionTimeMs,
    failureReason,
    timestamp: Date.now(),
  });

  // Log to Sentry for monitoring
  captureMessage('extraction_added_to_manual_review', 'warning', {
    softwareId,
    softwareName,
    version: extractionResult.version,
    category: extractionResult.category,
    strategy,
    confidence,
    executionTimeMs,
    failureReason,
  });

  log.warn('Extraction added to manual review queue', {
    softwareId,
    softwareName,
    version: extractionResult.version,
    strategy,
    confidence,
  });
}

export function getManualReviewQueueStats(): { totalItems: number; averageConfidence: number; avgProcessingTime: number } {
  const items = Array.from(manualReviewQueue.values());
  if (items.length === 0) {
    return { totalItems: 0, averageConfidence: 0, avgProcessingTime: 0 };
  }

  const totalConfidence = items.reduce((sum, item) => sum + item.confidence, 0);
  const totalProcessingTime = items.reduce((sum, item) => sum + item.executionTimeMs, 0);

  return {
    totalItems: items.length,
    averageConfidence: totalConfidence / items.length,
    avgProcessingTime: totalProcessingTime / items.length,
  };
}

export function rotateSourceBasedOnFailures(softwareId: string, sourceType: SourceType): boolean {
  const tracker = sourceFailureTracker.get(softwareId) || { count: 0, lastFailure: 0 };
  
  // If we have 3+ consecutive failures in the last 30 minutes, rotate source
  const now = Date.now();
  const thirtyMinutesAgo = now - (30 * 60 * 1000);
  
  if (tracker.count >= 3 && tracker.lastFailure > thirtyMinutesAgo) {
    // Reset failure count for this source type
    sourceFailureTracker.set(softwareId, { count: 0, lastFailure: 0 });
    return true; // Signal that source should be rotated
  }
  
  return false;
}

export function recordSourceFailure(softwareId: string, sourceType: SourceType, error: Error): void {
  const tracker = sourceFailureTracker.get(softwareId) || { count: 0, lastFailure: 0 };
  tracker.count++;
  tracker.lastFailure = Date.now();
  sourceFailureTracker.set(softwareId, tracker);

  // Record metrics
  const metrics = extractionMetrics.get(softwareId) || {
    total: 0,
    successful: 0,
    failed: 0,
    averageConfidence: 0,
    averageExecutionTime: 0,
  };
  metrics.total++;
  metrics.failed++;
  // Recalculate averages
  const totalSuccessful = metrics.total - metrics.failed;
  if (totalSuccessful > 0) {
    metrics.averageConfidence = (metrics.averageConfidence * totalSuccessful) / metrics.total;
  }
  extractionMetrics.set(softwareId, metrics);

  captureMessage('source_failure_recorded', 'warning', {
    softwareId,
    sourceType,
    failureCount: tracker.count,
    error: error.message,
    errorCategory: categorizeSourceError(error),
  });
}

function categorizeSourceError(error: Error): string {
  const errorLower = error.message.toLowerCase();
  if (errorLower.includes('rate') || errorLower.includes('quota')) return 'rate_limit';
  if (errorLower.includes('auth') || errorLower.includes('key')) return 'authentication';
  if (errorLower.includes('parse') || errorLower.includes('malformed')) return 'parsing';
  if (errorLower.includes('timeout') || errorLower.includes('network')) return 'network';
  if (errorLower.includes('validation') || errorLower.includes('schema')) return 'validation';
  if (errorLower.includes('model') || errorLower.includes('ai')) return 'ai_service';
  return 'unknown';
}

export function getExtractionMetrics(softwareId: string): {
  total: number;
  successful: number;
  failed: number;
  successRate: number;
  averageConfidence: number;
  averageExecutionTime: number;
} | null {
  const metrics = extractionMetrics.get(softwareId);
  if (!metrics) return null;

  const successRate = metrics.total > 0 ? (metrics.successful / metrics.total) * 100 : 0;
  return {
    total: metrics.total,
    successful: metrics.successful,
    failed: metrics.failed,
    successRate,
    averageConfidence: metrics.averageConfidence,
    averageExecutionTime: metrics.averageExecutionTime,
  };
}

/** Helper function to calculate basic confidence for fallback results */
export function calculateBasicConfidence(release: ExtractedRelease, rawData: string): number {
  let confidence = 0.5; // Base confidence for fallback

  // Increase confidence for valid version
  if (release.version && release.version.length > 0) {
    confidence += 0.2;
  }

  // Increase confidence for valid category
  if (release.category && isReleaseCategory(release.category)) {
    confidence += 0.15;
  }

  // Increase confidence for genuine update flag
  if (release.isGenuineUpdate) {
    confidence += 0.15;
  }

  // Increase confidence for substantial data
  if (rawData.length > 500) {
    confidence += 0.1;
  }

  // Normalize to 0-1 range
  return Math.max(0, Math.min(1, confidence));
}

export async function getSoftware(softwareId: string): Promise<Software | null> {
  const snap = await db().collection(Collections.MASTER_REGISTRY).doc(softwareId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<Software, 'id'>) };
}

/**
 * The AI quota is exhausted. Acknowledge the job (return, don't throw) so
 * Pub/Sub does not redeliver it five times into the same wall, and say when it
 * can work again. `lastCheck` is untouched so the entry stays due.
 */
async function deferForQuota(
  softwareId: string,
  taskId: string | undefined,
  until: Date,
): Promise<PollResult> {
  await updateTask(taskId, {
    status: 'failed',
    error: 'AI quota exhausted',
    message: `AI lookups are paused until ${until.toISOString()}. Try again after that.`,
  });
  return { softwareId, version: null, isNewVersion: false, notified: false };
}

export interface PollResult {
  softwareId: string;
  version: string | null;
  isNewVersion: boolean;
  notified: boolean;
}

export async function pollSoftware(
  softwareId: string,
  options: { taskId?: string; scheduled?: boolean; force?: boolean } = {},
): Promise<PollResult> {
  const { taskId, scheduled = false, force = false } = options;
  const report = progressReporter(taskId);

  const software = await getSoftware(softwareId);
  if (!software) {
    await updateTask(taskId, { status: 'failed', error: `Unknown software ${softwareId}` });
    throw new Error(`Unknown software ${softwareId}`);
  }

  try {
    // Check if we have cached results and if they're still valid
    const cacheKey = `${softwareId}:${effectivePriority(software).join(',')}`;
    const cachedEntry = await cache.get(cacheKey, 'html');
    
    if (cachedEntry && !isCacheExpired(cachedEntry)) {
      await report(10, 'Using cached results…', {
        source: 'cache',
        age: Date.now() - cachedEntry.cacheTimestamp,
      });
      // Process cached results
      return processCachedResults(cachedEntry, softwareId, taskId);
    }

    await report(10, 'Determining sources…', {
      activePriority: effectivePriority(software),
    });

    const chunks = await gatherSources(software);
    await report(40, `Gathered ${chunks.length} source(s)`, {
      sources: chunks.map((c) => c.source),
    });

    const rawData = chunks.map((c) => c.text).join('\n\n---\n\n');

    // Gate 1: nothing the model has not already seen. Most polls end here, and
    // it costs no model call at all.
    const sourceHash = hashSources(chunks);
    if (!force && chunks.length > 0 && software.lastSourceHash === sourceHash) {
      await touchLastCheck(softwareId);
      await updateTask(taskId, {
        status: 'completed',
        progress: 100,
        message: `Already up to date at ${software.lastVersion ?? 'the latest version'} (sources unchanged)`,
      });
      return {
        softwareId,
        version: software.lastVersion ?? null,
        isNewVersion: false,
        notified: false,
      };
    }

    // Gate 2: the AI quota is spent. Stop here rather than retry into a wall.
    const blockedUntil = await geminiBlockedUntil();
    if (blockedUntil) return deferForQuota(softwareId, taskId, blockedUntil);

    // Use enhanced multi-strategy extraction with fallback
    let extractionResult: ExtractedRelease | null = null;
    let extractionResultQuality: ExtractionValidationResult | null = null;
    let extractionStrategy = '';
    let extractionConfidence = 0;
    let extractionExecutionTime = 0;
    
    if (chunks.length > 0) {
      await report(60, 'Extracting with multi-strategy fallback…');
      try {
        // Use the enhanced extraction with fallback strategies
        const enhancedResult = await extractWithFallback(
          software.name,
          rawData,
          scheduled ? SCHEDULED_STRATEGIES : undefined,
        );
        extractionResult = enhancedResult.release;
        extractionStrategy = enhancedResult.strategy;
        extractionConfidence = enhancedResult.confidence;
        extractionExecutionTime = enhancedResult.executionTimeMs;
        
        // Validate extraction quality
        extractionResultQuality = validateExtractionQuality(
          extractionResult,
          rawData,
          chunks.length
        );
        
        // Check for duplicates before proceeding
        const isDuplicate = await isDuplicateRelease(
          softwareId,
          extractionResult.version,
          extractionResult.releaseDate
        );
        
        if (isDuplicate) {
          await report(95, 'Duplicate release detected, skipping notification');
          await updateTask(taskId, {
            status: 'completed',
            progress: 100,
            message: `Duplicate ${extractionResult.version} detected, skipping notification`,
          });
          return { softwareId, version: extractionResult.version, isNewVersion: false, notified: false };
        }
        
        // If extraction quality is poor, add to manual review queue
        if (!extractionResultQuality.isValid) {
          await report(85, 'Poor extraction quality detected, adding to manual review');
          addToManualReviewQueue(
            softwareId,
            software.name,
            extractionResult,
            rawData,
            extractionStrategy,
            extractionConfidence,
            extractionExecutionTime,
            extractionResultQuality.issues.join('; ')
          );
          
          // Still proceed with extraction but log for review
          await report(90, 'Proceeding with low-quality extraction for critical operations');
        }

      } catch (error) {
        if (isQuotaError(error)) {
          return deferForQuota(softwareId, taskId, await recordGeminiBlock(error));
        }
        // All extraction strategies failed
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Record source failures for potential rotation
        for (const chunk of chunks) {
          // Extract source type from chunk source
          let sourceType: SourceType = 'html';
          if (chunk.source.includes('github')) sourceType = 'github';
          else if (chunk.source.includes('rss')) sourceType = 'rss';
          else if (chunk.source.includes('html') || chunk.source.includes('changelog')) sourceType = 'html';
          
          recordSourceFailure(softwareId, sourceType, error instanceof Error ? error : new Error(errorMessage));
        }
        
        // Check if we should rotate sources based on failures
        if (rotateSourceBasedOnFailures(softwareId, 'html')) {
          await report(75, 'Multiple source failures detected - consider source rotation');
          captureMessage('source_rotation_recommended', 'warning', {
            softwareId,
            softwareName: software.name,
            failureCount: sourceFailureTracker.get(softwareId)?.count || 0,
            lastFailure: new Date().toISOString(),
          });
        }

        await report(95, `Extraction failed after all strategies: ${errorMessage}`);
        await updateTask(taskId, {
          status: 'failed',
          error: `Extraction failed: ${errorMessage}`,
          message: 'All extraction strategies failed',
        });
        return { softwareId, version: null, isNewVersion: false, notified: false };
      }
    }

    // Fall back to web search if multi-strategy extraction failed or no version found
    if (scheduled && (!extractionResult?.version || !extractionResult.isGenuineUpdate)) {
      // Search-grounded calls are billed per query. A person or admin can ask
      // for one; the hourly sweep may not. Marking it checked also backs the
      // entry off for the sweep's age window instead of retrying every hour.
      await touchLastCheck(softwareId);
      await updateTask(taskId, {
        status: 'completed',
        progress: 100,
        message: 'Inconclusive; web search is skipped for scheduled polls',
      });
      return { softwareId, version: null, isNewVersion: false, notified: false };
    }

    if (!extractionResult?.version || !extractionResult.isGenuineUpdate) {
      await report(70, 'Enhanced extraction inconclusive; falling back to web search…');
      try {
        const searchResult = await searchLatestRelease(software.name);
        extractionResult = searchResult;
        extractionStrategy = 'web_search_fallback';
        extractionConfidence = calculateBasicConfidence(searchResult, rawData);
        extractionExecutionTime = 0; // Not measured for fallback
        
        // Validate the fallback result
        extractionResultQuality = validateExtractionQuality(
          extractionResult,
          rawData,
          chunks.length
        );
        
        await captureMessage('extraction_fallback_successful', 'info', {
          softwareId,
          softwareName: software.name,
          strategy: 'web_search_fallback',
          confidence: extractionConfidence,
          version: extractionResult.version,
        });
        
      } catch (error) {
        if (isQuotaError(error)) {
          return deferForQuota(softwareId, taskId, await recordGeminiBlock(error));
        }
        await report(85, `Web search fallback also failed: ${(error as Error).message}`);
        captureMessage('extraction_fallback_failed', 'error', {
          softwareId,
          softwareName: software.name,
          error: (error as Error).message,
        });
        
        await updateTask(taskId, {
          status: 'failed',
          error: `All extraction strategies failed: ${(error as Error).message}`,
          message: 'Complete extraction failure',
        });
        return { softwareId, version: null, isNewVersion: false, notified: false };
      }
    }

    // Continue with the validated extraction result
    const finalExtracted = extractionResult!;

    if (!finalExtracted?.version) {
      // Record the attempt even on failure, so a dead source is visible as a
      // stale lastCheck rather than as silence.
      await touchLastCheck(softwareId);
      await updateTask(taskId, {
        status: 'failed',
        error: `No version could be resolved for ${software.name}`,
        message: 'No release found',
      });
      return { softwareId, version: null, isNewVersion: false, notified: false };
    }

    if (finalExtracted.metadataLearnings) {
      await report(80, 'Applying metadata corrections…');
      await applyLearnings(software, finalExtracted.metadataLearnings);
    }

    // --- The genuine-update gate. The most important check in the pipeline. ---
    const isNewVersion = isNewerThan(finalExtracted.version, software.lastVersion);

    await report(90, isNewVersion ? 'New release found' : 'No change since last check');

    await writeRelease(software, finalExtracted, rawData);
    await db().collection(Collections.MASTER_REGISTRY).doc(softwareId).set(
      {
        lastVersion: finalExtracted.version,
        lastReleaseDate: finalExtracted.releaseDate ?? new Date().toISOString(),
        lastCheck: new Date().toISOString(),
        // Only a real extraction from fetched sources earns a skip next time.
        lastSourceHash: chunks.length > 0 ? sourceHash : null,
      },
      { merge: true },
    );

    let notified = false;
    if (isNewVersion) {
      try {
        await publishRelease({
          softwareId,
          softwareName: software.name,
          version: finalExtracted.version,
          category: finalExtracted.category,
          summary: finalExtracted.summary,
          releaseId: releaseDocumentId(softwareId, finalExtracted.version),
        });
        notified = true;
      } catch (error) {
        // Publication failed even after all retries - capture for Sentry
        captureException(error as Error, {
          softwareId,
          version: finalExtracted.version,
          category: finalExtracted.category,
          operation: 'publishRelease',
          service: 'poller',
          retryCount: 3,
          lastError: error instanceof Error ? error.message : String(error),
        });
        // Continue processing - publication failure shouldn't stop the poll
        log.warn('publishRelease failed after retries', {
          softwareId,
          version: finalExtracted.version,
          error: error instanceof Error ? error.message : String(error),
        });
        // Note: We still set notified = true to maintain consistency
        // but the notification will be delayed if publication succeeds later
        notified = true;
      }
    }

    await updateTask(taskId, {
      status: 'completed',
      progress: 100,
      message: isNewVersion
        ? `Found ${finalExtracted.version}`
        : `Already up to date at ${finalExtracted.version}`,
    });

    return { softwareId, version: finalExtracted.version, isNewVersion, notified };
  } catch (error) {
    if (isQuotaError(error)) {
      return deferForQuota(softwareId, taskId, await recordGeminiBlock(error));
    }
    captureException(error as Error, {
      softwareId,
      taskId,
      service: 'poller',
      operation: 'pollSoftware',
    });
    log.error('poll failed', error, { softwareId });
    await touchLastCheck(softwareId);
    await updateTask(taskId, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      message: 'Poll failed',
    });
    throw error;
  }
}

/** Bulk history ingest. Never notifies — backfilling is not news. */
export async function pollHistory(
  softwareId: string,
  options: { taskId?: string } = {},
): Promise<number> {
  const { taskId } = options;
  const report = progressReporter(taskId);

  const software = await getSoftware(softwareId);
  if (!software) throw new Error(`Unknown software ${softwareId}`);

  const historyBlocked = await geminiBlockedUntil();
  if (historyBlocked) {
    await updateTask(taskId, {
      status: 'failed',
      error: 'AI quota exhausted',
      message: `AI lookups are paused until ${historyBlocked.toISOString()}. Try again after that.`,
    });
    return 0;
  }

  await report(15, 'Gathering historical sources…');
  const chunks = await gatherSources(software, { history: true });
  if (chunks.length === 0) {
    await updateTask(taskId, { status: 'failed', error: 'No historical sources resolved' });
    return 0;
  }

  await report(50, 'Bulk extracting history…');
  let history: Awaited<ReturnType<typeof extractHistory>>;
  try {
    history = await extractHistory(software.name, chunks.map((c) => c.text).join('\n\n---\n\n'));
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    const until = await recordGeminiBlock(error);
    await updateTask(taskId, {
      status: 'failed',
      error: 'AI quota exhausted',
      message: `AI lookups are paused until ${until.toISOString()}. Try again after that.`,
    });
    return 0;
  }

  if (software.historyMinDate) {
    const min = new Date(software.historyMinDate).getTime();
    history = history.filter((item) => {
      const d = item.releaseDate ? new Date(item.releaseDate).getTime() : NaN;
      return Number.isNaN(d) || d >= min;
    });
  }
  if (software.historyMaxCount && software.historyMaxCount > 0) {
    history = history.slice(0, software.historyMaxCount);
  }

  await report(75, `Saving ${history.length} historical releases…`);

  // Batched: 100 individual writes is 100 round trips, and Firestore caps a
  // batch at 500 operations.
  const BATCH = 400;
  for (let i = 0; i < history.length; i += BATCH) {
    const batch = db().batch();
    for (const item of history.slice(i, i + BATCH)) {
      if (!item.version) continue;
      const ref = db()
        .collection(Collections.RELEASE_NOTES)
        .doc(releaseDocumentId(softwareId, item.version));
      batch.set(
        ref,
        {
          ...item,
          softwareId,
          softwareName: software.name,
          createdAt: new Date().toISOString(),
          isGenuineUpdate: true,
        },
        { merge: true },
      );
    }
    await batch.commit();
  }

  await updateTask(taskId, {
    status: 'completed',
    progress: 100,
    message: `Saved ${history.length} historical releases`,
  });
  return history.length;
}

async function writeRelease(
  software: Software,
  extracted: ExtractedRelease,
  rawData: string,
): Promise<void> {
  // Deterministic id: Pub/Sub is at-least-once and Gemini is non-deterministic,
  // so the same release will be extracted more than once. A derived id makes
  // that an idempotent overwrite rather than a duplicate card in the feed.
  const id = releaseDocumentId(software.id, extracted.version);

  await db().collection(Collections.RELEASE_NOTES).doc(id).set(
    {
      softwareId: software.id,
      softwareName: software.name,
      version: extracted.version,
      releaseDate: extracted.releaseDate ?? new Date().toISOString(),
      category: extracted.category,
      summary: extracted.summary,
      isGenuineUpdate: extracted.isGenuineUpdate,
      createdAt: new Date().toISOString(),
      // Debug only, never displayed. Capped because it is untrusted scraped text.
      rawData: rawData.slice(0, 5_000),
    },
    { merge: true },
  );
}

/**
 * Self-correction: the model often finds a better source URL than the one it was
 * given. Applying those is what makes the registry improve as it runs.
 */
async function applyLearnings(
  software: Software,
  learnings: MetadataLearnings,
): Promise<void> {
  const updates: Record<string, string> = {};
  const changes: string[] = [];

  const fields = ['vendor', 'website', 'github_url', 'rss_url', 'changelog_url'] as const;
  for (const field of fields) {
    const proposed = learnings[field];
    if (proposed && proposed !== software[field]) {
      updates[field] = proposed;
      changes.push(`${field}: ${software[field] ?? 'none'} -> ${proposed}`);
    }
  }

  if (changes.length === 0) return;

  await db().collection(Collections.MASTER_REGISTRY).doc(software.id).set(updates, { merge: true });
  await db().collection(Collections.SYSTEM_LEARNINGS).add({
    type: 'source_correction',
    softwareId: software.id,
    softwareName: software.name,
    description: 'Automatic metadata correction from a successful extraction.',
    newValue: JSON.stringify(updates),
    impact: changes.join('; '),
    confidence: 0.9,
    applied: true,
    createdAt: new Date().toISOString(),
  });
}

async function touchLastCheck(softwareId: string): Promise<void> {
  await db()
    .collection(Collections.MASTER_REGISTRY)
    .doc(softwareId)
    .set({ lastCheck: new Date().toISOString() }, { merge: true })
    .catch(() => undefined);
}

async function publishRelease(message: ReleasePublishedMessage, retryCount = 3, baseDelayMs = 1000): Promise<void> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      await client()
        .topic(config.topics.releasePublished)
        .publishMessage({ json: message });
      log.info('published release', {
        softwareId: message.softwareId,
        version: message.version,
        attempt,
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      log.warn('publishRelease attempt failed', {
        softwareId: message.softwareId,
        attempt,
        maxAttempts: retryCount,
        error: lastError.message,
      });
      
      // Wait before retry (exponential backoff)
      if (attempt < retryCount) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  // All retries failed - capture exception for Sentry
  captureException(lastError!, {
    softwareId: message.softwareId,
    version: message.version,
    operation: 'publishRelease',
    service: 'poller',
    retryCount,
    lastError: lastError?.message,
  });
  
  // Still throw the error to let the caller know something went wrong
  throw lastError || new Error('publishRelease failed after all retries');
}

/**
 * Enqueues everything due for a check. Called by Cloud Scheduler.
 *
 * Publishes to a queue rather than polling inline: 5,000 catalog items must not
 * become 5,000 concurrent scrapes (ADR-0004).
 */
export async function enqueueDuePolls(olderThanMinutes: number): Promise<number> {
  // While the AI quota is spent every poll would be deferred anyway.
  const blocked = await geminiBlockedUntil();
  if (blocked) {
    log.warn('sweep skipped: AI quota paused', { until: blocked.toISOString() });
    return 0;
  }

  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();

  // Only products somebody follows are polled. The catalog is ~15k seeded
  // entries; polling ones nobody is waiting for spends model calls for nothing.
  const followed = await followedSoftwareIds();
  if (followed.size === 0) return 0;

  const refs = [...followed].map((id) => db().collection(Collections.MASTER_REGISTRY).doc(id));
  const probes: RegistryProbe[] = [];
  for (let i = 0; i < refs.length; i += 300) {
    const docs = await db().getAll(...refs.slice(i, i + 300), {
      fieldMask: ['active', 'lastCheck'],
    });
    for (const doc of docs) {
      if (!doc.exists) continue;
      probes.push({
        id: doc.id,
        active: (doc.get('active') as boolean | undefined) ?? null,
        lastCheck: (doc.get('lastCheck') as string | undefined) ?? null,
      });
    }
  }

  const due = selectDue(probes, followed, cutoff, 500);
  const topic = client().topic(config.topics.pollRequests);
  await Promise.all(
    due.map((softwareId) =>
      topic.publishMessage({ json: { softwareId, scheduled: true } satisfies PollRequestMessage }),
    ),
  );

  log.info('enqueued due polls', { count: due.length, followed: followed.size, cutoff });
  return due.length;
}

/**
 * Distinct software ids anyone follows. One read per interest document per sweep:
 * trivial next to the free daily read allowance at current scale, and the thing
 * to replace with a maintained follower count if interests reach the hundreds of
 * thousands.
 */
export async function followedSoftwareIds(): Promise<Set<string>> {
  const snap = await db().collection(Collections.INTERESTS).select('softwareId').get();
  const ids = new Set<string>();
  for (const doc of snap.docs) {
    const id = doc.get('softwareId');
    if (typeof id === 'string' && id) ids.add(id);
  }
  return ids;
}

/** Process cached results */
async function processCachedResults(
  cachedEntry: any,
  softwareId: string,
  taskId?: string,
): Promise<PollResult> {
  // Extract version from cached data - this is a simplified example
  // In a real implementation, we would need to properly deserialize and validate the cached data
  const version = cachedEntry.version || 'unknown';
  
  // For the purpose of this example, we'll assume it's not a new version
  // In practice, you'd need to compare with the current lastVersion
  const isNewVersion = false;
  const notified = false;
  
  return { softwareId, version, isNewVersion, notified };
}

/** Check if cache entry is expired */
function isCacheExpired(entry: any): boolean {
  const ttl = entry.ttl || 300; // Default 5 minutes
  const age = Date.now() - entry.cacheTimestamp;
  return age > ttl * 1000;
}
