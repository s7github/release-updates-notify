# ADR-0012: Subscription entitlements are server-owned; the console writes through the API

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

The subscription tiers existed as a string on `users/{uid}` and as marketing copy
in two clients. Nothing read the tier to decide what data to show, and nothing
enforced a limit. A FREE account could read the full history and export it.

The web console had the opposite problem. It still performed administrative
writes directly against Firestore — catalogue edits, release-note deletion, task
deletion, "magic discovery" — from code inherited from the original PWA. ADR-0006
had already removed client write access to those collections, so every one of
those buttons was a permission-denied error waiting for a click. The console also
hardcoded an admin email and set `isAdmin` in React state regardless of what the
rules would allow.

Three things had to become true together:

1. A tier must change what data a person sees, not only what a badge says.
2. An admin must be able to operate the product without weakening the rules.
3. An admin change must leave a record, because "the admin can change anything"
   and "nobody knows who changed it" is not an acceptable pair.

## Decision

### Entitlements live in one server module and one client module

`backend/src/lib/entitlements.ts` is authoritative. `web/src/services/entitlements.ts`
mirrors it for UI and query shaping. The values:

| Capability | FREE | PRO | ENTERPRISE |
|---|---|---|---|
| Tracked items | 5 | unlimited | unlimited |
| Visible history | 30 days | full | full |
| Timeline rows per product | 5 | 500 | 1,000 |
| History backfill | no | yes | yes |
| CSV/JSON export | no | yes | yes |
| Discovery / hour | 5 | 25 | 100 |
| Refresh / hour | 10 | 60 | 300 |

A paid tier with a past `subscriptionExpiresAt` behaves as FREE. A missing expiry
means no expiry. An unparseable expiry fails closed to FREE.

The **server** enforces the quotas and refuses `includeHistory` without the
backfill entitlement. The **client** shapes the feed and timeline queries to the
tier. The free *follow cap* is client-enforced; the API-level limits and paid
operations are not. Moving interest writes behind the API would make that cap
hard, and is noted in `SECURITY.md` as a gap rather than pretended away.

### Privileged writes go through `/v1/admin/*`

`backend/src/routes/admin.ts` mounts a router behind `requireAuth` **and**
`requireAdmin`. `requireAdmin` checks `admins/{uid}` with the Admin SDK. The
router owns:

- catalogue create / edit / delete, source re-discovery, poll enqueue, poll-all
- release verify / edit / delete / bulk delete, with `lastVersion` recomputed
- task deletion
- subscription tier and expiry changes
- admin grant / revoke, with guards against self-revocation and removing the last
  admin
- an overview count for the console header

Deleting a catalogue entry requires `confirmName` to match the stored name
exactly; the API deletes the entry's releases and interests in bounded batches.
The console cannot send a field the API does not know: unknown keys are rejected,
not dropped.

### Every mutation writes `admin_audit`

`admin_audit/{id}` records the verified actor UID, the email from the verified ID
token, the action, the target, and before/after snapshots. Admins can read it;
no client can write it. The web console shows it live.

### The web client stops calling Gemini and stops proxying arbitrary URLs

The browser's `@google/genai` client, its poller, its task writer, and the
unauthenticated `/api/proxy` handler are removed. Discovery is one explicit
button that calls `/v1/discover`. The API key stays in Secret Manager / the
server environment. This closes the "key baked into the bundle" problem recorded
in `STATUS.md` §1.7.

## Alternatives considered

| Option | Why not |
|---|---|
| Let admins write Firestore directly, with a rule that checks `admins/{uid}` | The rules would then carry write validation for every collection, and a compromised admin token becomes a database-wide write credential. The API is the narrower surface and the only place that can write an audit log atomically. |
| Enforce the free follow cap in Firestore rules | Rules cannot count a collection. A `trackedCount` field the client updates is a number the client can lie about. |
| Put the tier in a custom auth claim | Claims need a token refresh to change and cannot express an expiry cleanly. Document data updates apply on the next snapshot. |
| Keep the client-side poller as a fallback | It is the exact pattern ADR-0003 removes, it requires a key in the bundle, and with the hardened rules it cannot write its results anyway. |

## Consequences

**Good**

- The console's buttons work, and they work through the same trust boundary as
  the rest of the product.
- Tier differences are visible in what loads, not just in copy.
- Admin actions are attributable after the fact.
- The web bundle no longer contains a Gemini key or an open proxy.

**Bad**

- One more network hop for admin actions; the console is a desktop tool, so this
  is not on a hot path.
- The entitlement numbers exist in two files. They are small and documented; a
  drift test would be better than discipline, and is not written yet.
- `admin_audit` grows forever unless a TTL policy is added. It is small, but it
  is not free.

**Revisit if**

- Billing is added. Then the tier should be derived from the payment provider's
  webhook, and `subscriptionUpdatedBy` becomes `stripe` rather than an admin.
- The follow cap must become a hard boundary; that is the moment to move
  interest writes behind the API.
