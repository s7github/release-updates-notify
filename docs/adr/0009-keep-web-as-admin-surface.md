# ADR-0009: Keep the React PWA as the operator surface

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

The conversion to native Android was scoped to the **user-facing** app: auth,
dashboard, library, add software, software detail, settings.

The existing React app also contains roughly 880 lines of admin UI — Registry
Manager, Processing monitor, Learning Insights, User Insights — built on MUI's
`DataGrid`. These are dense, wide, multi-column operator tools.

The question is whether to port them, drop them, or keep them where they are.

## Decision

Keep the React PWA in `web/` and retain it as the **operator surface**. The
Android app is the **consumer surface**. Neither tries to be both.

The web app stays deployed and stays maintained for admin use. Its consumer
routes remain functional but are no longer the primary target.

## Alternatives considered

| Option | Why not |
|---|---|
| Port admin screens to Android | A twelve-column data grid on a 6-inch screen is worse than the thing it replaces. This is effort spent making a tool less usable. |
| Delete the web app | Throws away working admin tooling and leaves no way to manage the registry until an admin surface is rebuilt. The registry needs curating from day one. |
| Rebuild admin as a new internal tool | Correct eventually, wrong now. The existing one works. Rebuilding it competes with shipping the Android app for no user-visible gain. |

## Consequences

**Good:**
- Admin tooling exists on day one, on a screen size suited to it.
- The Android scope stays honest and shippable.
- The web app doubles as a reference implementation of the domain logic while
  the Kotlin port is written.

**Bad — the price we are paying:**
- Two frontends against one schema. A schema change must be applied to both, or
  one silently breaks. This is the main ongoing tax, and the reason
  [`DATA_MODEL.md`](../DATA_MODEL.md) is normative rather than descriptive.
- The web app's consumer routes will rot as Android becomes primary. Accepted;
  they are not the product any more.
- Two toolchains in CI.

**Revisit if:**
- The web app's consumer routes are formally retired, at which point it should be
  stripped down to admin-only and the dead routes deleted rather than left to
  decay.
