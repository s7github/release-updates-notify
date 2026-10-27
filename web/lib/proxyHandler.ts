/**
 * The old open proxy is closed.
 *
 * It fetched arbitrary URLs from the server with no authentication and no
 * allow-list, which is a request-forgery primitive aimed at internal networks
 * and a bandwidth bill aimed at this project. Scraping now happens only inside
 * the `poller` service, which knows the catalog and enforces quotas.
 *
 * The route is kept as a tombstone so old deployments return a clear 410 rather
 * than a framework 404 that looks like a transient error.
 */
export function proxyHandler(_req: unknown, res: any) {
  res.status(410).json({
    error: "The browser proxy has been removed. Discovery and polling run server-side.",
  });
}
