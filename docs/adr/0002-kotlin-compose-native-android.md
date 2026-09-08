# ADR-0002: Kotlin + Jetpack Compose native, not cross-platform

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

The existing product is a React PWA. The request is explicitly for a *native*
Android app. The obvious cheaper paths — wrap the PWA, or rewrite in a
cross-platform framework that reuses the React knowledge — deserve a real hearing
before being dismissed.

What the app actually needs from the platform:

- Reliable push notifications with per-category user control. This is the entire
  product; a release tracker that does not notify is a changelog viewer.
- Background sync that survives Doze and App Standby.
- Offline reading of already-fetched release notes.
- Notification channels, deep links from a notification into a release, and
  eventually a home-screen widget.

## Decision

Native Android: Kotlin 2.x, Jetpack Compose with Material 3, targeting
`compileSdk`/`targetSdk` 36 with `minSdk` 26.

`minSdk 26` (Android 8.0) is chosen because notification channels — which is how
per-category muting is implemented — were introduced there, and because 26+
covers effectively the entire active device base. Supporting older versions would
mean a second notification code path for a rounding error of users.

## Alternatives considered

| Option | Why not |
|---|---|
| Ship the PWA in a WebView / TWA | Fastest path, and it fails at the one thing that matters. Web Push on Android is workable but second-class, background sync is not reliable, and notification channels are unavailable. The product's core feature would be its weakest. |
| Flutter | Genuinely good, and would give iOS free. But it is a second language and a second ecosystem for a team already holding TypeScript, and the FCM/notification-channel integration — the part that has to be excellent — is where a plugin layer hurts most. |
| React Native | Reuses React knowledge, which is a real advantage. Rejected because the app is not UI-heavy; it is notification-, background-, and platform-integration-heavy, which is precisely where RN's bridge costs the most for the least benefit. |
| Kotlin Multiplatform | Attractive if iOS were on the roadmap. It is not, yet. KMP would add build complexity now to buy an option we have not decided to exercise. The domain and data layers are written as pure Kotlin with no Android dependencies, so this stays cheap to adopt later. |

## Consequences

**Good:**
- Full access to notification channels, WorkManager, Doze-aware scheduling.
- Compose + Material 3 gives dynamic colour and predictable modern UI for less
  code than the View system.
- Strict null-safety and coroutines make the async data layer genuinely simpler
  than the promise-based original.

**Bad — the price we are paying:**
- No iOS. If iOS is wanted, it is a separate app or a KMP migration.
- Zero code reuse from the React app. The port is a rewrite; only the domain
  logic and the prompts carry over.
- Compose has a real learning curve for a React developer, despite the
  superficial similarity of the mental model.

**Revisit if:**
- iOS becomes a requirement. At that point evaluate KMP for the shared
  domain/data layers rather than rewriting twice — the layers are already
  Android-free for this reason.
