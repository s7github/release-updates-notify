/**
 * Structured logging for Cloud Logging.
 *
 * Cloud Run parses stdout as JSON when it looks like JSON, and picks up
 * `severity` and `message` specifically. Plain console.log lands as unindexed
 * text, which is unsearchable exactly when you need it.
 */

type Severity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

function emit(severity: Severity, message: string, fields: Record<string, unknown> = {}) {
  const entry = { severity, message, ...fields };
  const line = JSON.stringify(entry);
  if (severity === 'ERROR' || severity === 'WARNING') {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

export const log = {
  debug: (message: string, fields?: Record<string, unknown>) =>
    emit('DEBUG', message, fields),
  info: (message: string, fields?: Record<string, unknown>) =>
    emit('INFO', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) =>
    emit('WARNING', message, fields),
  error: (message: string, error?: unknown, fields?: Record<string, unknown>) =>
    emit('ERROR', message, {
      ...fields,
      error: error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : String(error ?? ''),
    }),
};
