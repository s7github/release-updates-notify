# ADR-0006: Client is read-mostly; rules deny by default

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

The inherited `firestore.rules` grants any signed-in user:

- `create` on `master_registry` — so the client could perform "magic discovery"
- `create` on `release_notes` — so the client could write its own poll results
- `write` on `background_tasks` — commented in the source as
  *"user can create via client for now"*

It also hardcodes an admin email address directly in the rules:

```javascript
request.auth.token.email == "saurabh257@gmail.com"
```

This was survivable when the client did the polling. Under
[ADR-0003](0003-server-side-ai-and-polling.md) the client no longer polls, so
these grants are now pure attack surface. And they are reachable surface: the
Firebase project config is extractable from any APK, and the Firestore REST API
accepts any authenticated request — an attacker never needs to run the app.

With these rules, anyone who can sign in with Google can rewrite the global
catalog every user reads, and forge release notes that get pushed to every
subscriber. That last one is a notification-spam vector aimed at the entire user
base.

## Decision

**Default deny.** Then, narrowly:

| Collection | Client read | Client write |
|---|---|---|
| `users/{uid}` | own doc only | own doc, **allow-listed fields only** |
| `interests` | own only | own only, validated |
| `master_registry` | signed-in | **none** — backend only |
| `release_notes` | signed-in | **none** — backend only |
| `background_tasks` | own tasks | **none** — enqueued via the API |
| `system_learnings` | admin only | **none** |
| `admins` | signed-in (to resolve own role) | **none** |

The backend writes with the Admin SDK, which bypasses rules entirely — so
removing client write access costs the pipeline nothing.

Admin identity moves out of the rules and into the `admins` collection, checked
by document existence. The hardcoded email is deleted. Bootstrapping the first
admin is a deliberate one-off operation documented in
[`SECURITY.md`](../SECURITY.md), not a permanent branch in a security rule.

Field-level validation on the writes that remain: type checks, length caps
(the original security spec's "Denial of Wallet" and "Resource Exhaustion"
cases), and `hasOnly()` on update diffs so a client cannot inject a field the
schema does not define — closing the privilege-escalation and shadow-field
payloads that `docs/security-spec-original.md` already identified but the rules
never actually blocked.

## Alternatives considered

| Option | Why not |
|---|---|
| Keep permissive rules, add App Check | App Check attests the *app*, not the *user*. It raises the bar for scripted abuse; it does nothing against a modified client or a legitimate user acting maliciously. Worth adding as defence in depth, not as the control. |
| Route every read through the backend too | Loses Firestore's real-time listeners and offline cache — the two reasons to use it. Adds a hop and a service to scale for no security gain, since rules already authorise reads correctly. |
| Keep the hardcoded admin email as a fallback | An email string in a security rule is a credential in a public file. It also breaks the moment that address changes. |

## Consequences

**Good:**
- Forged catalog entries and forged release notes become impossible from the
  client. The notification-spam vector closes.
- The rules become a readable statement of the trust model rather than a record
  of what the client happened to need.
- Admin membership is data, so granting and revoking is an operation, not a
  deploy.

**Bad — the price we are paying:**
- "Magic discovery" must round-trip through the `api` service. Slower than a
  direct client write, and it needs its own rate limiting — which it needed
  anyway, since it spends money on Gemini.
- Rules now need their own test suite (`firebase/test/`) and CI job. Untested
  security rules are guesses.
- Bootstrapping the first admin is a manual step. Documented, deliberate, and
  correct — but it is friction on a fresh environment.

**Revisit if:**
- Never for the write grants. The validation specifics will evolve with the
  schema; the shape of the trust model should not.
