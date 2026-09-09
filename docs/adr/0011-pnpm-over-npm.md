# ADR-0011: pnpm over npm

- **Status:** Accepted
- **Date:** 2026-09-09

## Context

Three Node packages live here — `backend` (370 deps), `firebase` (767, mostly
`firebase-tools`), and `web` (the retained React app). Together that is roughly
1,100 packages and tens of thousands of small files.

npm copies every one of those into each project's `node_modules` on every
`npm ci`. That was measured on this project's own hardware:

| | HDD (7200rpm) | NVMe SSD |
|---|---|---|
| `backend` install | not finished after 25 min | 8 s |
| `firebase` install | stalled | 20 s |

The SSD move fixed the acute pain, so this is not a rescue. Two things still
argued for changing:

1. **`verify.ps1` reinstalls on every run.** A "does `node_modules` exist" guard
   is wrong — an interrupted install leaves the directory behind with binaries
   missing, which surfaces later as a baffling `'tsc' is not recognized`. So the
   script always reinstalls, and the cost of that matters.
2. **`firebase-tools` is installed twice** — once for `firebase`, once for
   nothing else — and shared with nothing.

## Decision

pnpm for all three packages, pinned via `packageManager` in each `package.json`
so developers, CI and the Docker build agree on one version.

pnpm keeps a single content-addressable store and **hard-links** into each
project instead of copying. A re-install becomes a relink rather than tens of
thousands of file writes.

Also declared per package:

- `pnpm.onlyBuiltDependencies` — pnpm 10 blocks postinstall scripts by default.
  `esbuild` (which `tsx` needs to link its platform binary), `protobufjs` and
  `@firebase/util` genuinely need theirs. Listing them explicitly keeps installs
  non-interactive, which CI requires, while every other package stays blocked.

## What this immediately caught

pnpm's strict linking exposes only *declared* dependencies, and that found a
real latent bug on the first install:

```
src/services/scraper.ts(3,30): error TS2307: Cannot find module 'domhandler'
```

`scraper.ts` imports `domhandler` for its `Element` type but never declared it.
It worked only because npm's flat `node_modules` hoisted it as a transitive of
`cheerio` — a phantom dependency that would have broken silently the day cheerio
changed its tree. Now declared, pinned to `^5.0.3` to match the version cheerio
itself resolves, so the two `Element` types stay assignable.

## Alternatives considered

| Option | Why not |
|---|---|
| Stay on npm | Works. Pays the full copy cost on every reinstall, and permits phantom dependencies — one of which was already present and undetected. |
| Yarn (Berry) | Comparable speed. Plug'n'Play breaks tools that expect a real `node_modules`, and `firebase-tools` plus the Android-adjacent tooling are exactly the kind to break. `nodeLinker: node-modules` avoids that but then the advantage over pnpm is negligible. |
| Bun | Fastest installer of the three. Too much risk to put a young runtime under `firebase-admin` and the emulator suite for an install-speed win. |
| A pnpm workspace covering all three | Tempting, and probably right eventually. Deliberately not now: the three packages have unrelated lifecycles and `web` is on its way out (ADR-0009). Converting to a workspace is a separate, reversible change. |

## Consequences

**Good:**
- Reinstalls are near-free, so `verify.ps1` reinstalling every run costs nothing.
- One copy of `firebase-tools` on disk, shared by any project using it.
- Phantom dependencies become compile errors instead of latent breakage.
- `packageManager` pins one version across laptop, CI and the container image.

**Bad — the price we are paying:**
- pnpm must be installed. Mitigated by `corepack enable`, which ships with Node.
- Three lockfiles regenerated, so any in-flight branch touching dependencies will
  conflict and must re-resolve.
- pnpm 10's blocked-build-scripts default is a genuine trap: the failure appears
  much later as a missing binary, not as an install error. Hence the explicit
  `onlyBuiltDependencies` lists.
- Strict linking will surface further phantom dependencies as new code is added.
  That is the feature working, but it will look like pnpm "breaking" things.

**Revisit if:**
- The three packages start sharing dependencies enough to justify a real pnpm
  workspace with a single lockfile.
