/**
Sentry error logging integration for UpdateNotify.

This module provides robust error tracking and monitoring for the UpdateNotify platform.
It integrates with Sentry to capture, categorize, and monitor errors across the entire
application stack.
 */

import * as Sentry from '@sentry/node';
import { config } from './config.js';
import { log } from './logging.js';

// OpenTelemetry span status codes (1 = ok, 2 = error), as used by Sentry v9 spans.
const SPAN_STATUS_OK = 1;
const SPAN_STATUS_ERROR = 2;

export function initializeSentry(): void {
  if (config.service === 'api') {
    // Only initialize Sentry in the API service
    const dsn = process.env.SENTRY_DSN;
    
    if (!dsn) {
      log.warn('Sentry DSN not configured, error tracking will be limited');
      return;
    }

    try {
      Sentry.init({
        dsn,
        serverName: config.service,
        environment: process.env.NODE_ENV || 'development',
        release: process.env.SENTRY_RELEASE || 'unknown',
        
        // Performance monitoring
        tracesSampleRate: 0.1,
        
        // Error filtering and categorization
        beforeSend(event, hint) {
          // Filter out sensitive information
          if (event.user) {
            delete event.user.ip_address;
          }
          
          // Add contextual information
          event.extra = {
            ...event.extra,
            service: config.service,
            projectId: config.projectId,
            category: 'error_tracking',
          };
          
          return event;
        },
        
        // Performance monitoring
        profilesSampleRate: 0.05,
      });
      
      log.info('Sentry initialized successfully');
    } catch (error) {
      log.error('Failed to initialize Sentry', error);
    }
  }
}

export function captureException(error: Error, context?: Record<string, unknown>): void {
  if (!Sentry.getClient()) {
    log.warn('Sentry not initialized, capturing exception locally');
    log.error(error.message, error, context);
    return;
  }

  Sentry.withScope((scope) => {
    // Add context to the error
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    
    // Add fingerprint for error grouping
    scope.setFingerprint([error.name, error.message]);
    
    // Capture the error
    Sentry.captureException(error);
  });
}

export function captureMessage(message: string, level: 'error' | 'warning' | 'info' | 'debug' = 'error', context?: Record<string, unknown>): void {
  if (!Sentry.getClient()) {
    log.warn('Sentry not initialized, capturing message locally');
    log[level === 'warning' ? 'warn' : level](message, context);
    return;
  }

  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    
    Sentry.captureMessage(message, level);
  });
}

export function captureTransaction(name: string, op: string, tags?: Record<string, string>): void {
  if (!Sentry.getClient()) {
    log.warn('Sentry not initialized, capturing transaction locally');
    return;
  }

  Sentry.startSpan({ name, op, attributes: tags }, () => undefined);
}

/** Enhanced extraction monitoring with detailed metrics and alerting */
export function captureExtractionMetrics(
  operation: string,
  metrics: {
    softwareName: string;
    strategy?: string;
    confidence?: number;
    executionTimeMs?: number;
    sourceCount?: number;
    success: boolean;
    error?: string;
    errorCategory?: 'rate_limit' | 'authentication' | 'parsing' | 'network' | 'validation' | 'ai_service' | 'permission' | 'unknown';
    version?: string;
    category?: string;
    isDuplicate?: boolean;
    manualReviewRequired?: boolean;
  }
): void {
  const event = {
    message: `Extraction ${operation}`,
    level: (metrics.success ? 'info' : 'error') as 'info' | 'error',
    category: 'extraction',
    ...metrics,
  };

  // Capture detailed metrics for alerting and analysis
  captureMessage(event.message, event.level, {
    operation,
    softwareName: metrics.softwareName,
    strategy: metrics.strategy,
    confidence: metrics.confidence,
    executionTimeMs: metrics.executionTimeMs,
    sourceCount: metrics.sourceCount,
    success: metrics.success,
    error: metrics.error,
    errorCategory: metrics.errorCategory,
    version: metrics.version,
    category: metrics.category,
    isDuplicate: metrics.isDuplicate,
    manualReviewRequired: metrics.manualReviewRequired,
    timestamp: new Date().toISOString(),
  });

  // Enhanced error tracking with categorization
  if (!metrics.success && metrics.error) {
    const error = new Error(metrics.error);
    captureException(error, {
      operation,
      softwareName: metrics.softwareName,
      strategy: metrics.strategy,
      errorCategory: metrics.errorCategory,
      confidence: metrics.confidence,
      executionTimeMs: metrics.executionTimeMs,
      version: metrics.version,
      category: metrics.category,
      sourceCount: metrics.sourceCount,
      manualReviewRequired: metrics.manualReviewRequired,
    });
  }
}

/** Monitor extraction pipeline performance and reliability */
export function captureExtractionPipelineMetrics(
  metrics: {
    totalSoftwareProcessed: number;
    totalExtractionAttempts: number;
    successfulExtractions: number;
    failedExtractions: number;
    averageConfidence: number;
    averageExecutionTime: number;
    duplicateRate: number;
    manualReviewQueueSize: number;
    sourceRotationCount: number;
    lastHealthCheck: string;
  }
): void {
  captureMessage('extraction_pipeline_metrics', 'info', {
    ...metrics,
    pipelineHealth: calculatePipelineHealth(metrics),
    timestamp: new Date().toISOString(),
  });
}

function calculatePipelineHealth(metrics: {
  totalSoftwareProcessed: number;
  totalExtractionAttempts: number;
  successfulExtractions: number;
  failedExtractions: number;
  averageConfidence: number;
  averageExecutionTime: number;
  duplicateRate: number;
  manualReviewQueueSize: number;
  sourceRotationCount: number;
}): number {
  const successRate = metrics.totalExtractionAttempts > 0 
    ? metrics.successfulExtractions / metrics.totalExtractionAttempts 
    : 0;
  
  const confidenceScore = metrics.averageConfidence;
  const performanceScore = Math.max(0, 1 - (metrics.averageExecutionTime / 60000)); // penalizes >60s
  const duplicateScore = Math.max(0, 1 - metrics.duplicateRate);
  const manualReviewScore = Math.max(0, 1 - (metrics.manualReviewQueueSize / 100)); // penalizes >100 items
  
  // Weighted average of all factors
  return (successRate * 0.3 + confidenceScore * 0.25 + performanceScore * 0.2 + 
          duplicateScore * 0.15 + manualReviewScore * 0.1);
}

/** Alert on extraction quality issues */
export function alertExtractionQualityIssue(
  issue: {
    type: 'low_confidence' | 'high_duplicate_rate' | 'manual_review_backlog' | 'source_rotation_required' | 'performance_degradation';
    severity: 'warning' | 'error' | 'critical';
    softwareId?: string;
    softwareName?: string;
    metricValue: number;
    threshold: number;
    details?: string;
  }
): void {
  const alertMessage = `Extraction Quality Alert: ${issue.type}`;
  const alertLevel = issue.severity === 'critical' ? 'error' : issue.severity;
  
  captureMessage(alertMessage, alertLevel, {
    alertType: issue.type,
    severity: issue.severity,
    softwareId: issue.softwareId,
    softwareName: issue.softwareName,
    metricValue: issue.metricValue,
    threshold: issue.threshold,
    details: issue.details,
    timestamp: new Date().toISOString(),
    requiresAction: issue.severity === 'critical',
  });
}

export function addBreadcrumb(message: string, category: string = 'default', level: 'error' | 'warning' | 'info' | 'debug' = 'info', data?: Record<string, unknown>): void {
  if (!Sentry.getClient()) {
    // Don't log breadcrumbs when Sentry is not available
    return;
  }

  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
    timestamp: Date.now(),
  });
}

export function setUserContext(userId?: string, email?: string): void {
  if (!Sentry.getClient()) return;

  if (userId) {
    Sentry.setUser({
      id: userId,
      email,
    });
  } else {
    Sentry.setUser(null);
  }
}

export function withSentry<T>(operation: () => Promise<T>, operationName: string, context?: Record<string, unknown>): Promise<T> {
  return Sentry.startSpan(
    {
      name: operationName,
      op: 'function',
      ...context,
    },
    async (span) => {
      try {
        const result = await operation();
        span?.setStatus({ code: SPAN_STATUS_OK });
        return result;
      } catch (error) {
        span?.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        if (error instanceof Error) {
          captureException(error, { operation: operationName, ...context });
        }
        throw error;
      }
    },
  );
}

export function logError(error: Error, context: Record<string, unknown> = {}): void {
  // Log to both Sentry and local logging
  captureException(error, context);
  
  // Also log locally for immediate visibility
  log.error(error.message, error, {
    ...context,
    service: config.service,
    timestamp: new Date().toISOString(),
  });
}

export function logWarning(message: string, context: Record<string, unknown> = {}): void {
  captureMessage(message, 'warning', context);
  log.warn(message, context);
}

export function logInfo(message: string, context: Record<string, unknown> = {}): void {
  captureMessage(message, 'info', context);
  log.info(message, context);
}

export function logDebug(message: string, context: Record<string, unknown> = {}): void {
  captureMessage(message, 'debug', context);
  log.debug(message, context);
}

export function startHealthCheck(): void {
  if (!Sentry.getClient()) return;

  // Create a health check transaction
  Sentry.startSpan(
    {
      name: 'health_check',
      op: 'job',
      attributes: { service: config.service, type: 'periodic' },
    },
    () => undefined,
  );
}

export function capturePerformanceMetric(name: string, value: number, unit: string = 'ms'): void {
  if (!Sentry.getClient()) return;

  Sentry.setMeasurement(name, value, unit);
}

export function shutdown(): Promise<void> {
  if (!Sentry.getClient()) return Promise.resolve();
  
  return Sentry.close().then(() => undefined);
}
