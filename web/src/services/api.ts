import { auth } from "./firebase";

/**
 * The only way the web console is allowed to change anything privileged.
 *
 * Firestore rules deny client writes to the catalog, release notes, tasks,
 * tiers and admins (ADR-0006). Those operations live in the `api` service; this
 * client attaches the caller's Firebase ID token and nothing else.
 */

const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const API_BASE = (
  configured ||
  (import.meta.env.DEV ? "http://localhost:8080" : "https://updatenotify-api-vwdnd6mwaq-ez.a.run.app")
).replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  code?: string;
  tier?: string;

  constructor(message: string, status: number, code?: string, tier?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.tier = tier;
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ApiError("Sign in first", 401);

  const token = await user.getIdToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
        authorization: "Bearer " + token,
      },
    });

    const text = await response.text();
    const payload = text ? safeJson(text) : null;

    if (!response.ok) {
      const message =
        (payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error: unknown }).error)
          : null) || `Request failed (${response.status})`;
      const code =
        payload && typeof payload === "object" && "code" in payload
          ? String((payload as { code: unknown }).code)
          : undefined;
      const tier =
        payload && typeof payload === "object" && "tier" in payload
          ? String((payload as { tier: unknown }).tier)
          : undefined;
      throw new ApiError(message, response.status, code, tier);
    }

    return (payload ?? {}) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("The API took too long to respond", 504);
    }
    throw new ApiError(error instanceof Error ? error.message : "Network error", 0);
  } finally {
    clearTimeout(timeout);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export interface MeResponse {
  uid: string;
  tier: "FREE" | "PRO" | "ENTERPRISE";
  subscriptionExpiresAt: string | null;
  isAdmin: boolean;
  limits: {
    maxTrackedItems: number | null;
    historyDays: number | null;
    timelineItems: number;
    historyBackfill: boolean;
    exportEnabled: boolean;
    discoveryPerHour: number;
    refreshPerHour: number;
  };
}

export const userApi = {
  me: () => apiFetch<MeResponse>("/v1/me"),

  discover: (query: string) =>
    apiFetch<{ softwareId: string; taskId: string | null; alreadyExisted: boolean }>(
      "/v1/discover",
      { method: "POST", body: JSON.stringify({ query }) },
    ),

  refresh: (softwareId: string, includeHistory = false) =>
    apiFetch<{ taskId: string; includeHistory: boolean; tier: string }>("/v1/refresh", {
      method: "POST",
      body: JSON.stringify({ softwareId, includeHistory }),
    }),
};

export const adminApi = {
  overview: () =>
    apiFetch<{
      users: number;
      software: number;
      releases: number;
      activeTasks: number;
      admins: number;
    }>("/v1/admin/overview"),

  listAdmins: () =>
    apiFetch<Array<{ uid: string; email?: string; seededAt?: string }>>("/v1/admin/admins"),

  grantAdmin: (uid: string) =>
    apiFetch<{ uid: string; alreadyAdmin: boolean }>("/v1/admin/admins", {
      method: "POST",
      body: JSON.stringify({ uid }),
    }),

  revokeAdmin: (uid: string) =>
    apiFetch<{ uid: string; revoked: boolean }>(`/v1/admin/admins/${encodeURIComponent(uid)}`, {
      method: "DELETE",
    }),

  updateUserTier: (
    uid: string,
    subscriptionTier: "FREE" | "PRO" | "ENTERPRISE",
    subscriptionExpiresAt: string | null,
  ) =>
    apiFetch<{ uid: string; subscriptionTier: string; subscriptionExpiresAt: string | null }>(
      `/v1/admin/users/${encodeURIComponent(uid)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ subscriptionTier, subscriptionExpiresAt }),
      },
    ),

  createRegistry: (name: string, discover = true) =>
    apiFetch<{
      softwareId: string;
      discovered: boolean;
      warning: string | null;
      taskId: string;
    }>("/v1/admin/registry", {
      method: "POST",
      body: JSON.stringify({ name, discover }),
    }),

  updateRegistry: (softwareId: string, patch: Record<string, unknown>) =>
    apiFetch<{ softwareId: string; updated: string[] }>(
      `/v1/admin/registry/${encodeURIComponent(softwareId)}`,
      { method: "PATCH", body: JSON.stringify(patch) },
    ),

  deleteRegistry: (softwareId: string, confirmName: string) =>
    apiFetch<{ softwareId: string; deletedReleases: number; deletedInterests: number }>(
      `/v1/admin/registry/${encodeURIComponent(softwareId)}`,
      { method: "DELETE", body: JSON.stringify({ confirmName }) },
    ),

  discoverRegistry: (softwareId: string) =>
    apiFetch<Record<string, unknown>>(
      `/v1/admin/registry/${encodeURIComponent(softwareId)}/discover`,
      { method: "POST" },
    ),

  pollRegistry: (
    softwareId: string,
    options: { includeHistory?: boolean; historyMaxCount?: number; historyMinDate?: string } = {},
  ) =>
    apiFetch<{ taskId: string; includeHistory: boolean }>(
      `/v1/admin/registry/${encodeURIComponent(softwareId)}/poll`,
      { method: "POST", body: JSON.stringify(options) },
    ),

  pollAll: () =>
    apiFetch<{ enqueued: number; failures: string[] }>("/v1/admin/poll-all", {
      method: "POST",
    }),

  updateRelease: (
    noteId: string,
    patch: { isVerified?: boolean; summary?: string; category?: string },
  ) =>
    apiFetch<{ noteId: string; updated: string[] }>(
      `/v1/admin/releases/${encodeURIComponent(noteId)}`,
      { method: "PATCH", body: JSON.stringify(patch) },
    ),

  deleteRelease: (noteId: string) =>
    apiFetch<{ noteId: string; softwareId: string; lastVersionRecomputed: boolean }>(
      `/v1/admin/releases/${encodeURIComponent(noteId)}`,
      { method: "DELETE" },
    ),

  bulkDeleteReleases: (softwareId: string, noteIds: string[]) =>
    apiFetch<{ deleted: number; skipped: number }>("/v1/admin/releases/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ softwareId, noteIds }),
    }),

  deleteTask: (taskId: string) =>
    apiFetch<{ deleted: boolean }>(`/v1/admin/tasks/${encodeURIComponent(taskId)}`, {
      method: "DELETE",
    }),
};
