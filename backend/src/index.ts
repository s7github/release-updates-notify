import { config } from './lib/config.js';
import { log } from './lib/logging.js';
import { createApiApp } from './routes/api.js';
import { createNotifierApp, createPollerApp } from './routes/worker.js';

/**
 * One image, three services.
 *
 * `SERVICE` decides which app this container runs. Three near-identical
 * Dockerfiles and three build pipelines would drift; one image with a switch
 * does not.
 */

function appFor(service: string) {
  switch (service) {
    case 'poller':
      return createPollerApp();
    case 'notifier':
      return createNotifierApp();
    case 'api':
      return createApiApp();
    default:
      throw new Error(
        `Unknown SERVICE "${service}". Expected one of: api, poller, notifier.`,
      );
  }
}

const app = appFor(config.service);

const server = app.listen(config.port, () => {
  log.info('service started', { service: config.service, port: config.port });
});

/**
 * Cloud Run sends SIGTERM and then waits before killing the container. Draining
 * in-flight requests here is the difference between a clean deploy and a handful
 * of 502s on every revision change.
 */
function shutdown(signal: string) {
  log.info('shutting down', { signal });
  server.close(() => process.exit(0));
  // If a request hangs, do not block the deploy forever.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
