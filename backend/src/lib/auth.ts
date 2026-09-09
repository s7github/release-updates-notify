import type { NextFunction, Request, Response } from 'express';
import { auth, Collections, db } from './firebase.js';
import { log } from './logging.js';

/**
 * Firebase ID token verification.
 *
 * The token is the only credential that leaves the device — short-lived, scoped
 * to one user, refreshed automatically by the Firebase SDK. Everything in this
 * service acts on behalf of the verified caller.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      uid?: string;
      isAdmin?: boolean;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  try {
    const decoded = await auth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (error) {
    // Deliberately vague to the caller: distinguishing "expired" from "forged"
    // tells an attacker which one they achieved.
    log.warn('token verification failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.uid) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const snap = await db().collection(Collections.ADMINS).doc(req.uid).get();
  if (!snap.exists) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  req.isAdmin = true;
  next();
}

/**
 * Verifies a Pub/Sub push subscription's OIDC token.
 *
 * A Cloud Run service reachable from the internet must not accept anything that
 * merely *looks* like a Pub/Sub envelope — that would let anyone trigger polls
 * and spend Gemini money.
 */
export async function requirePubSubToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    res.status(401).json({ error: 'Missing OIDC token' });
    return;
  }

  try {
    // Signed by Google for the push subscription's service account; Cloud Run
    // IAM ("run.invoker") is the outer gate and this is the inner one.
    const { OAuth2Client } = await import('google-auth-library');
    const client = new OAuth2Client();
    await client.verifyIdToken({ idToken: token });
    next();
  } catch (error) {
    log.warn('pubsub token verification failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(401).json({ error: 'Invalid OIDC token' });
  }
}

/** Decodes a Pub/Sub push envelope into the message body. */
export function decodePubSubMessage<T>(body: unknown): T | null {
  const message = (body as { message?: { data?: string } } | undefined)?.message;
  if (!message?.data) return null;
  try {
    return JSON.parse(Buffer.from(message.data, 'base64').toString('utf8')) as T;
  } catch {
    return null;
  }
}
