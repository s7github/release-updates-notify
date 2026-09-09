# Architecture Decision Records

An ADR captures **one decision, the forces behind it, and what it cost**. It is
written once and never edited. When a decision changes, write a new ADR that
supersedes the old one.

This is the answer to "why is it like this?" for anyone — human or agent —
arriving cold. Code shows *what*. Git log shows *when*. Only this shows *why*,
and why matters most when you are about to change something.

## Index

| # | Decision | Status |
|---|---|---|
| [0001](0001-monorepo-layout.md) | Monorepo over split repositories | Accepted |
| [0002](0002-kotlin-compose-native-android.md) | Kotlin + Compose native, not cross-platform | Accepted |
| [0003](0003-server-side-ai-and-polling.md) | AI and scraping are server-side, always | Accepted |
| [0004](0004-cloud-run-pubsub-pipeline.md) | Cloud Run + Pub/Sub, not Cloud Functions | Accepted |
| [0005](0005-offline-first-room-cache.md) | Room is the UI's source of truth | Accepted |
| [0006](0006-firestore-security-model.md) | Client is read-mostly; rules deny by default | Accepted |
| [0007](0007-modularization-strategy.md) | Multi-module by feature, core underneath | Accepted |
| [0008](0008-fcm-notification-fanout.md) | Push fan-out as its own pipeline stage | Accepted |
| [0009](0009-keep-web-as-admin-surface.md) | Keep the React PWA as the operator surface | Accepted |
| [0010](0010-agp9-toolchain-and-ksp-flags.md) | AGP 9 toolchain, and the two flags that make KSP work | Accepted |
| [0011](0011-pnpm-over-npm.md) | pnpm over npm | Accepted |

## Writing one

Copy [`TEMPLATE.md`](TEMPLATE.md), take the next free number, fill it in, add a
row above. Keep it short — one page. If it needs more than a page, it is probably
two decisions.

## Rules

1. **Never edit an accepted ADR.** Supersede it.
2. **Record rejected options.** The alternative you did not take is half the
   value; without it the next person re-litigates the same debate.
3. **Record the cost.** A decision with no downside listed is a decision that was
   not thought through.
