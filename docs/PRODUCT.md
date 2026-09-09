# Product

What UpdateNotify is for, and what that implies for anyone building it.

The original product brief is preserved verbatim in
[`PRD-original.md`](PRD-original.md). This is the current understanding.

---

## 1. The problem

Software you rely on ships updates constantly. Finding out about the ones that
matter means either subscribing to a dozen changelogs, RSS feeds and GitHub
release pages and reading all of them, or finding out by accident weeks later.

Most release notes are noise. "Bumped dependency", "internal refactor", "fixed
typo in docs". Buried in that is the occasional thing you genuinely needed to
know today — a security patch, a breaking change, the feature you have been
waiting for.

---

## 2. What the product does

You follow the things you care about. A pipeline watches their changelogs, uses
AI to turn raw HTML, RSS and JSON into structured release notes, categorises
them, and pushes you a notification **only when something real ships in a
category you asked about.**

Three claims, in priority order:

1. **It notices** — you do not have to check.
2. **It filters** — you get security patches without getting dependency bumps.
3. **It is timely** — a security patch reaches you today, not next week.

---

## 3. What this implies for the build

This is why the architecture looks the way it does.

| Because the product is… | The system must… |
|---|---|
| a *notification* product | notify reliably. Hence a server-side scheduler and FCM, not on-device polling that Doze will throttle ([ADR-0003](adr/0003-server-side-ai-and-polling.md)) |
| a *filtering* product | honour per-category preferences **before sending**. A fan-out that ignores them inverts the whole value ([ADR-0008](adr/0008-fcm-notification-fanout.md)) |
| about *trust* | never notify about a release that did not happen. The genuine-update gate is the most important line in the pipeline |
| read on the move | work offline. Release notes are immutable once published, so caching them is straightforward and worth it ([ADR-0005](adr/0005-offline-first-room-cache.md)) |

### The failure modes that kill it

Both are easy to build by accident, and both are fatal:

1. **Notifying when nothing happened.** A scheduled poll re-extracts the same
   release and notifies again. Users uninstall over this faster than over any
   crash.
2. **Notifying about everything.** Forty followed items, no filtering, and the
   product becomes the noise it was built to remove.

---

## 4. Who it is for

**Primary: people who depend on specific software.** Producers tracking DAW
releases, developers tracking framework versions, anyone who has been burned by
finding out about a breaking change too late.

The original brief's own examples — "Suno", "macOS", "FL Studio" — describe this
person well: a mix of creative tools, operating systems, and developer software,
which is why the catalog cannot assume everything has a GitHub releases page.

**Secondary: an operator** curating the catalog, fixing bad source URLs and
watching the pipeline. That is a desktop job on wide data grids, which is why the
web app is retained rather than ported
([ADR-0009](adr/0009-keep-web-as-admin-surface.md)).

---

## 5. Core concepts

| Term | Meaning |
|---|---|
| **Interest** | One person following one thing. Can be *tracked but silent* — in the library, no notifications. That is a distinct state from not tracked. |
| **Topic** | A free-text interest ("macOS", "AI safety") with no catalog entry. Deliberately equal to software in the library. |
| **Catalog entry** | A shared, global record of one software item and where it publishes changes. Shared, so the expensive work happens once for everyone. |
| **Release** | One structured version: version string, date, category, Markdown summary. |
| **Category** | The closed set users filter and mute on — the primary signal in the UI. |
| **Genuine update** | A release whose version differs from the last one published. The gate for notifying. |
| **Discovery** | Asking the backend to find sources for something not in the catalog. Costs money, so it is an explicit user action. |

---

## 6. Deliberate product decisions

- **Major releases are always notified.** No toggle. A user who muted everything
  still hears about a 1.x → 2.0.
- **"Tracked but silent" exists.** People want things in their library without
  being interrupted by them.
- **Topics are first-class.** Not everything worth watching has a changelog, and
  the fallback is a web search rather than a shrug.
- **Discovery is a button, not a fallback.** An empty search offers to search the
  web; it does not do it automatically. Each call spends money, and predictable
  cost is worth one tap.
- **Unknown categories are shown, never dropped.** Extraction is
  non-deterministic; losing a real release to a bad label is worse than an
  imperfect chip.

---

## 7. Explicitly out of scope for now

- iOS ([ADR-0002](adr/0002-kotlin-compose-native-android.md))
- Team or shared libraries — single-user only
- In-app changelog browsing for things you do not follow
- Digest notifications. A reasonable future preference; a bad default, because a
  security patch should not wait for tomorrow's digest.
- Native admin tooling on mobile ([ADR-0009](adr/0009-keep-web-as-admin-surface.md))
