import { proxyHandler } from "../lib/proxyHandler.js";

// Vercel serverless entry for /api/proxy; server.ts mounts the same handler locally.
export default proxyHandler;
