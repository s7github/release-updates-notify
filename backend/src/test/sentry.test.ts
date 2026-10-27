/**
 * Sentry wrapper smoke tests. Without a DSN the wrapper must degrade to a
 * no-op, never throw: error reporting must not be able to break the pipeline.
 */
import { describe, it, expect } from 'vitest';
import { captureException, captureMessage, logError, logWarning } from '../lib/sentry.js';

describe('sentry wrapper without a DSN', () => {
  it('captureException does not throw', () => {
    expect(() => captureException(new Error('boom'), { softwareId: 'x' })).not.toThrow();
  });

  it('captureMessage does not throw at any level', () => {
    for (const level of ['error', 'warning', 'info', 'debug'] as const) {
      expect(() => captureMessage('msg', level, { test: true })).not.toThrow();
    }
  });

  it('logError and logWarning do not throw', () => {
    expect(() => logError(new Error('boom'), { operation: 'test' })).not.toThrow();
    expect(() => logWarning('careful', { operation: 'test' })).not.toThrow();
  });
});
