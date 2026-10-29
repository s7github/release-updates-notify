# Batch 1: Rename, Onboarding, Empty States, Friendly Errors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the product to Release Scope, make following obvious for new users, give every empty feed a next step, and replace raw Firebase sign-in errors with plain wording.

**Architecture:** Pure, unit-tested functions (`describeAuthError`, `feedState`, `starterPicks`) hold the decisions; small React components render them. No data-model change. Brand strings come from one file, `web/src/brand.ts` (ADR-0020).

**Tech Stack:** React 19, MUI 9, react-hot-toast, Vitest (new dev dependency, see Task 1).

**Branch:** `feat/web-onboarding-batch1` (never commit to `main`). Commits use Conventional Commits, scope `web`. Commit only when the user asks (global rule); the commit steps below are what to run once they have.

**Public-site note (user requirement):** keep SEO in mind. Titles, descriptions and the brand name come from `brand.ts` so Batch 3 reuses them unchanged. Use real headings and link text; no text baked into images.

---

## File structure

| File | Responsibility |
|---|---|
| `web/src/brand.ts` (create) | Name, wordmark parts, tagline, origin |
| `web/src/services/authErrors.ts` (create) | Turn any sign-in error into a notice (silent / quiet / error) |
| `web/src/services/authErrors.test.ts` (create) | Tests for the above |
| `web/src/services/feedState.ts` (create) | Decide which empty/normal state the dashboard is in |
| `web/src/services/feedState.test.ts` (create) | Tests for the above |
| `web/src/services/starterPicks.ts` (create) | Curated starter names, resolved against the catalog |
| `web/src/components/Dashboard/EmptyFeed.tsx` (create) | One message + one button per state |
| `web/src/components/Onboarding/FirstRun.tsx` (create) | 3-step checklist for brand-new users |
| `web/vitest.config.ts` (create) | Test runner config |
| `web/package.json`, `web/index.html`, `web/metadata.json`, `web/public/manifest.json` (modify) | Test script, brand strings |
| `web/src/services/firebase.ts`, `web/src/App.tsx`, `web/src/pages/Landing.tsx` (modify) | Use `describeAuthError` |
| `web/src/pages/Dashboard.tsx`, `web/src/pages/Library.tsx` (modify) | Vocabulary, empty states |
| `android/app/src/main/res/values/strings.xml` (modify) | `app_name` |
| `docs/STATUS.md`, `docs/SETUP.md`, `docs/GLOSSARY.md`, `backend/.vercel/project.json` (modify) | Cleanup and notes |

---

### Task 1: Branch and test runner

**Files:** Modify `web/package.json`; create `web/vitest.config.ts`.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feat/web-onboarding-batch1
```

- [ ] **Step 2: Add Vitest**

Reason (record in the PR body): the web app has no test runner and this batch adds decision logic that must be tested. Vitest shares Vite's config and adds no runtime code.

```bash
cd web && pnpm add -D vitest@^3
```

- [ ] **Step 3: Add the script** — in `web/package.json` `scripts`, add after `"lint"`:

```json
    "lint": "tsc --noEmit",
    "test": "vitest run"
```

- [ ] **Step 4: Create `web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 5: Check it runs (no tests yet)**

Run: `cd web && pnpm test`
Expected: exits non-zero with "No test files found". That is fine; it proves the runner starts.

---

### Task 2: Friendly sign-in errors (requirement 5)

**Files:** Create `web/src/services/authErrors.ts`, `web/src/services/authErrors.test.ts`; modify `web/src/services/firebase.ts`, `web/src/App.tsx`, `web/src/pages/Landing.tsx`.

- [ ] **Step 1: Write the failing test** — `web/src/services/authErrors.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { describeAuthError, showAuthNotice } from "./authErrors";

const err = (code: string) => Object.assign(new Error(`Firebase: raw text (${code}).`), { code });

describe("describeAuthError", () => {
  it.each(["auth/user-cancelled", "auth/popup-closed-by-user", "auth/cancelled-popup-request"])(
    "treats %s as a quiet cancellation",
    (code) => {
      const notice = describeAuthError(err(code));
      expect(notice.kind).toBe("quiet");
      expect(notice.text).not.toMatch(/firebase|auth\/|idp/i);
    },
  );

  it("explains a blocked popup", () => {
    expect(describeAuthError(err("auth/popup-blocked"))).toEqual({
      kind: "error",
      text: "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.",
    });
  });

  it("never leaks the raw message for unknown errors", () => {
    const notice = describeAuthError(err("auth/something-new"));
    expect(notice.kind).toBe("error");
    expect(notice.text).toBe("We couldn't sign you in. Please try again.");
  });

  it("handles non-error values", () => {
    expect(describeAuthError(undefined).kind).toBe("error");
    expect(describeAuthError("boom").kind).toBe("error");
  });

  it("does not mention Firebase or Google Cloud project ids for the domain error", () => {
    const notice = describeAuthError(err("auth/unauthorized-domain"));
    expect(notice.text).not.toMatch(/firebase|gen-lang|console/i);
  });
});

describe("showAuthNotice", () => {
  const makeToast = () => Object.assign(vi.fn(), { error: vi.fn() });

  it("uses the neutral toast for cancellations", () => {
    const toast = makeToast();
    showAuthNotice(err("auth/user-cancelled"), toast, vi.fn());
    expect(toast).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("uses the error toast and logs the raw error for real failures", () => {
    const toast = makeToast();
    const log = vi.fn();
    const e = err("auth/internal-error");
    showAuthNotice(e, toast, log);
    expect(toast.error).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("Sign-in failed", e);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd web && pnpm test`
Expected: FAIL, "Failed to resolve import ./authErrors".

- [ ] **Step 3: Implement** — `web/src/services/authErrors.ts`

```ts
/**
 * Sign-in errors, in words a user can act on. The raw Firebase message is never
 * shown (it names the stack and ends in a code like "(auth/user-cancelled)");
 * it goes to the console for us instead.
 */
export type AuthNotice =
  | { kind: "quiet"; text: string } // the user chose to stop; not an error
  | { kind: "error"; text: string };

const CANCELLED = new Set([
  "auth/user-cancelled",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
]);

function codeOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }
  return "";
}

export function describeAuthError(error: unknown): AuthNotice {
  const code = codeOf(error);
  if (CANCELLED.has(code)) {
    return { kind: "quiet", text: "Sign-in cancelled. You can try again whenever you're ready." };
  }
  switch (code) {
    case "auth/popup-blocked":
      return { kind: "error", text: "Your browser blocked the sign-in window. Allow pop-ups for this site and try again." };
    case "auth/network-request-failed":
      return { kind: "error", text: "Network problem while signing in. Check your connection and try again." };
    case "auth/too-many-requests":
      return { kind: "error", text: "Too many sign-in attempts. Wait a moment and try again." };
    case "auth/unauthorized-domain":
      return { kind: "error", text: "Sign-in isn't available from this address. Open the app from its main website and try again." };
    default:
      return { kind: "error", text: "We couldn't sign you in. Please try again." };
  }
}

type Toast = { (message: string): unknown; error: (message: string) => unknown };

/** Show the right toast for a sign-in failure. `toast` and `log` are injected so this stays testable. */
export function showAuthNotice(
  error: unknown,
  toast: Toast,
  log: (...args: unknown[]) => void = console.warn,
): void {
  const notice = describeAuthError(error);
  if (notice.kind === "quiet") {
    toast(notice.text);
    return;
  }
  log("Sign-in failed", error);
  toast.error(notice.text);
}
```

- [ ] **Step 4: Run and see it pass**

Run: `cd web && pnpm test`
Expected: PASS, 9 tests.

- [ ] **Step 5: Use it.** Find every caller first:

Run: `cd web && grep -rn "authErrorMessage" src`
Expected: `firebase.ts` (definition), `App.tsx:73`, `Landing.tsx`.

In `App.tsx` replace `toast.error(authErrorMessage(error))` with `showAuthNotice(error, toast)` and change the import. In `Landing.tsx` do the same in the sign-in handler's `catch`. Then delete the `authErrorMessage` function (lines 56-70) from `firebase.ts`. Import line for both pages:

```ts
import { showAuthNotice } from "../services/authErrors"; // App.tsx uses "./services/authErrors"
```

- [ ] **Step 6: Type-check**

Run: `cd web && pnpm run lint`
Expected: no errors.

- [ ] **Step 7: Commit (when the user asks)**

```bash
git add web/package.json web/pnpm-lock.yaml web/vitest.config.ts web/src/services/authErrors.ts web/src/services/authErrors.test.ts web/src/services/firebase.ts web/src/App.tsx web/src/pages/Landing.tsx
git commit -m "feat(web): show plain-language sign-in messages and treat cancel as quiet"
```

---

### Task 3: Brand file and rename (owner request)

**Files:** Create `web/src/brand.ts`; modify `web/index.html`, `web/metadata.json`, `web/public/manifest.json`, `web/src/pages/Dashboard.tsx:244`, `web/src/components/layout/Navbar.tsx`, `web/src/pages/Landing.tsx`, `android/app/src/main/res/values/strings.xml`, `backend/src/services/discovery.ts:39`, `docs/GLOSSARY.md`.

- [ ] **Step 1: Create `web/src/brand.ts`**

```ts
/** Single source for the product name. See docs/adr/0020-release-scope-brand-and-domain.md. */
export const BRAND = {
  /** Used in every sentence, title and meta tag. */
  name: "Release Scope",
  /** Logo lockup only: "Release" regular + "Scope" bold. */
  wordmark: { light: "Release", bold: "Scope" },
  tagline: "See every release the moment it ships.",
  description:
    "Follow the software you rely on. Release Scope reads changelogs for you and tells you when something genuinely new ships.",
  domain: "releasescope.com",
  origin: "https://releasescope.com",
} as const;
```

- [ ] **Step 2: Static metadata.** In `web/index.html` replace `<title>UpdateNotify PWA</title>` with:

```html
    <title>Release Scope – See every release the moment it ships</title>
    <meta name="description" content="Follow the software you rely on. Release Scope reads changelogs for you and tells you when something genuinely new ships." />
    <meta name="theme-color" content="#0b0d10" />
```

(Batch 3 replaces this with per-page tags; this keeps the shell sensible now. `theme-color` must equal the app background — check `web/public/manifest.json` `background_color` and use the same value.)

In `web/public/manifest.json`: `"name": "Release Scope"`, `"short_name": "Release Scope"`. In `web/metadata.json`: `"name": "Release Scope"`.

- [ ] **Step 3: Visible strings.**
  - `Dashboard.tsx:244`: replace `"Welcome to UpdateNotify!"` with `` `Welcome to ${BRAND.name}!` `` and add `import { BRAND } from "../brand";`. (Task 6 replaces this whole block; do this edit anyway so the build is correct if tasks are executed out of order.)
  - `Navbar.tsx` and `Landing.tsx`: run `grep -n "Update\|Notify\|Release Updates" web/src/components/layout/Navbar.tsx web/src/pages/Landing.tsx`. Render the brand as:

```tsx
<span>
  <span style={{ fontWeight: 400 }}>{BRAND.wordmark.light}</span>
  <span style={{ fontWeight: 800 }}>{BRAND.wordmark.bold}</span>
</span>
```

  Wrap it so assistive tech and crawlers read the plain name: `<span aria-label={BRAND.name}> … </span>`.
  - `strings.xml`: `<string name="app_name">Release Scope</string>`.
  - `backend/src/services/discovery.ts:39`: User-Agent becomes `'ReleaseScope-Discovery/1.0 (+https://releasescope.com)'` (a User-Agent token has no spaces).
  - `docs/GLOSSARY.md`: add a row "UpdateNotify — former name; still used in code identifiers (see ADR-0020)".

- [ ] **Step 4: Verify nothing user-visible still says the old name**

Run: `git grep -n -i "updatenotify" -- web/src web/index.html web/public/manifest.json android/app/src/main/res`
Expected: only `web/src/services/api.ts` (a Cloud Run hostname) and the `Theme.UpdateNotify` style names in `themes.xml` (code identifiers; leave).

- [ ] **Step 5: Build** — `cd web && pnpm run lint && pnpm run build` → success.

- [ ] **Step 6: Commit (when asked)**

```bash
git add web/src/brand.ts web/index.html web/metadata.json web/public/manifest.json web/src android/app/src/main/res/values/strings.xml backend/src/services/discovery.ts docs/GLOSSARY.md docs/adr/0020-release-scope-brand-and-domain.md
git commit -m "feat(web): rename the product to Release Scope"
```

---

### Task 4: One vocabulary (requirement 1)

**Files:** Modify `web/src/pages/Dashboard.tsx:21,156,212,311-312`, `web/src/pages/Library.tsx:61`, `web/src/pages/AddSoftware.tsx` (button label, toast, hint).

Rule: the verb is **Follow**. The two lists are **Following** (gets notifications) and **Muted** (saved in your library, no notifications).

- [ ] **Step 1: Dashboard tabs** (`Dashboard.tsx:311-312`)

```tsx
          <Tab label="Following" sx={{ fontWeight: 700 }} />
          <Tab label="Muted" sx={{ fontWeight: 700 }} />
```

- [ ] **Step 2: Comments and toasts.** `Dashboard.tsx:21` comment → `// 0: Following, 1: Muted`; line 156 comment → `// Everything in the library that is NOT following=true is under Muted`; line 212 toast → `!interest.following ? "Following – you'll get its updates" : "Muted – saved in your library, no notifications"`.

- [ ] **Step 3: Library toast** (`Library.tsx:61`)

```tsx
toast.success(!currentStatus ? "Following – you'll get its updates" : "Muted – saved in your library, no notifications");
```

- [ ] **Step 4: Add page.** In `AddSoftware.tsx` change the button text `Track Updates` → `Follow`, `toast.success(\`Tracking ${name}\`)` → `` toast.success(`Following ${name}`) ``, `toast.error(\`You already track "${name}"\`)` → `` toast.error(`You already follow "${name}"`) ``, the chip label `tracked` → `followed`, and the page heading `Discover Software` → `Find software to follow`. Add one help line under the heading: `Pick what you want to hear about. We'll tell you when a new version ships.`

- [ ] **Step 5: Verify** — `cd web && pnpm run lint` → no errors; `git grep -n -i "track" web/src/pages` → remaining hits are only tier wording such as `maxTrackedItems`.

- [ ] **Step 6: Commit (when asked)** — `git commit -m "feat(web): use Follow and Muted consistently"` after `git add web/src/pages`.

---

### Task 5: Feed state decision (requirement 2, logic)

**Files:** Create `web/src/services/feedState.ts`, `web/src/services/feedState.test.ts`.

- [ ] **Step 1: Failing test** — `feedState.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { feedState } from "./feedState";

const base = { interestCount: 3, followedCount: 2, releaseCount: 8, visibleCount: 4 };

describe("feedState", () => {
  it("empty library", () => {
    expect(feedState({ ...base, interestCount: 0, followedCount: 0, releaseCount: 0, visibleCount: 0 })).toBe("no-library");
  });
  it("library has items but none are followed", () => {
    expect(feedState({ ...base, followedCount: 0, releaseCount: 0, visibleCount: 0 })).toBe("none-followed");
  });
  it("followed, but nothing has been published yet", () => {
    expect(feedState({ ...base, releaseCount: 0, visibleCount: 0 })).toBe("nothing-yet");
  });
  it("releases exist but filters or the plan window hide them", () => {
    expect(feedState({ ...base, visibleCount: 0 })).toBe("filtered-out");
  });
  it("normal feed", () => {
    expect(feedState(base)).toBe("has-releases");
  });
});
```

- [ ] **Step 2:** `cd web && pnpm test` → FAIL (module missing).

- [ ] **Step 3: Implement** — `feedState.ts`

```ts
export type FeedState = "no-library" | "none-followed" | "nothing-yet" | "filtered-out" | "has-releases";

export interface FeedInputs {
  /** All interests, software and topics. */
  interestCount: number;
  /** Software interests with following === true. */
  followedCount: number;
  /** Release notes loaded for the library (before tab/date/category filters). */
  releaseCount: number;
  /** Release cards that survive every filter on the current tab. */
  visibleCount: number;
}

export function feedState(i: FeedInputs): FeedState {
  if (i.interestCount === 0) return "no-library";
  if (i.followedCount === 0) return "none-followed";
  if (i.releaseCount === 0) return "nothing-yet";
  if (i.visibleCount === 0) return "filtered-out";
  return "has-releases";
}
```

- [ ] **Step 4:** `pnpm test` → PASS (14 total).

---

### Task 6: EmptyFeed component and wiring (requirements 1 and 2)

**Files:** Create `web/src/components/Dashboard/EmptyFeed.tsx`; modify `web/src/pages/Dashboard.tsx`.

Note on the Muted tab: `feedState` reasons about the Following tab. On the Muted tab an empty list should say "Nothing is muted. Everything in your library is on the Following tab." Handle that in the component via the `tab` prop.

- [ ] **Step 1: Create `EmptyFeed.tsx`**

```tsx
import { Box, Button, Paper, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import type { FeedState } from "../../services/feedState";

interface Props {
  state: Exclude<FeedState, "has-releases">;
  tab: "following" | "muted";
  libraryCount: number;
  onFollowAll: () => void;
  onShowWiderRange: () => void;
}

interface Copy { title: string; body: string; cta?: { label: string; to?: string; onClick?: () => void } }

export default function EmptyFeed({ state, tab, libraryCount, onFollowAll, onShowWiderRange }: Props) {
  const copy = describe(state, tab, libraryCount, onFollowAll, onShowWiderRange);
  return (
    <Paper sx={{ textAlign: "center", py: 10, px: 3, borderRadius: 4, border: "1px dashed rgba(255,255,255,0.1)", bgcolor: "rgba(255,255,255,0.02)" }}>
      <Typography variant="h5" component="h2" sx={{ fontWeight: 800, mb: 1 }}>{copy.title}</Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 480, mx: "auto", mb: copy.cta ? 4 : 0 }}>
        {copy.body}
      </Typography>
      {copy.cta && (
        <Box>
          {copy.cta.to ? (
            <Button component={Link} to={copy.cta.to} variant="contained" size="large" sx={{ borderRadius: 100, px: 4 }}>{copy.cta.label}</Button>
          ) : (
            <Button onClick={copy.cta.onClick} variant="contained" size="large" sx={{ borderRadius: 100, px: 4 }}>{copy.cta.label}</Button>
          )}
        </Box>
      )}
    </Paper>
  );
}

function describe(
  state: Props["state"], tab: Props["tab"], count: number,
  onFollowAll: () => void, onShowWiderRange: () => void,
): Copy {
  if (tab === "muted") {
    return { title: "Nothing is muted", body: "Everything in your library is on the Following tab. Mute an item there to keep it saved without notifications." };
  }
  switch (state) {
    case "no-library":
      return { title: "Follow your first piece of software", body: "Pick something you use. We'll watch its changelog and show every new release here.", cta: { label: "Find software to follow", to: "/library/add" } };
    case "none-followed":
      return {
        title: "You're not following anything right now",
        body: `You have ${count} saved ${count === 1 ? "item" : "items"} in your library, but none of them are followed. Follow them to get their updates here, or add something new.`,
        cta: { label: count === 1 ? "Follow it" : `Follow all ${count}`, onClick: onFollowAll },
      };
    case "nothing-yet":
      return { title: "Nothing has shipped yet", body: "We're watching what you follow. New releases appear here the moment they're published, usually within the hour.", cta: { label: "Follow more software", to: "/library/add" } };
    case "filtered-out":
      return { title: "No releases match these filters", body: "There are releases for what you follow, but not in this date range or category.", cta: { label: "Show the full window", onClick: onShowWiderRange } };
  }
}
```

Check the add route first: `grep -n "path=" web/src/App.tsx` and use the real path for adding software in the two `to:` values (the file above assumes `/library/add`).

- [ ] **Step 2: Wire into `Dashboard.tsx`.**

Imports:

```tsx
import EmptyFeed from "../components/Dashboard/EmptyFeed";
import { feedState } from "../services/feedState";
```

After `topics` (line 202) add:

```tsx
  const softwareInterests = interests.filter((i) => i.type === "software");
  const followedCount = softwareInterests.filter((i) => i.following === true).length;
  const state = feedState({
    interestCount: interests.length,
    followedCount,
    releaseCount: releases.length,
    visibleCount: filteredReleases.length,
  });

  const followAll = async () => {
    try {
      await Promise.all(
        softwareInterests.filter((i) => i.following !== true)
          .map((i) => updateDoc(doc(db, "interests", i.id), { following: true })),
      );
      toast.success("Following everything in your library");
    } catch {
      toast.error("Couldn't update your library. Please try again.");
    }
  };

  const showWiderRange = () => {
    setTimelineCategory("All");
    setSelectedTopic("All");
    handleDateTypeChange("1y");
    setPage(1);
  };
```

Replace the whole `interests.length === 0 && !loading ? ( <Paper …> ) : ( <> …` branch head (lines 242-254) with a first-run branch: keep the structure `interests.length === 0 && !loading ? ( <FirstRun /> ) : ( <> … )` (FirstRun is built in Task 7; until then render `<EmptyFeed state="no-library" tab="following" libraryCount={0} onFollowAll={followAll} onShowWiderRange={showWiderRange} />`).

Replace the `paginatedReleases.length === 0 && ( … "No Updates Found" … )` block (lines 371-381) with:

```tsx
            {paginatedReleases.length === 0 && state !== "has-releases" && (
              <Grid size={{ xs: 12 }}>
                <EmptyFeed
                  state={state}
                  tab={tab === 0 ? "following" : "muted"}
                  libraryCount={softwareInterests.length}
                  onFollowAll={followAll}
                  onShowWiderRange={showWiderRange}
                />
              </Grid>
            )}
```

Also keep the Free-plan sentence: inside `showWiderRange` the plan window still caps results; after the `EmptyFeed` add nothing else.

- [ ] **Step 3: Verify by running the app.** Use the `run` skill. With a test account in each situation (no library; library with everything muted; followed with no releases; followed with a narrow date range) confirm the matching title and that the button does what it says. Record what you saw in the PR body. If you cannot sign in locally, say so rather than claiming it was checked.

- [ ] **Step 4:** `cd web && pnpm run lint && pnpm test && pnpm run build` → all pass.

- [ ] **Step 5: Commit (when asked)** — `git commit -m "feat(web): explain empty feeds and offer the next step"`.

---

### Task 7: First-run checklist and starter picks (requirement 1)

**Files:** Create `web/src/services/starterPicks.ts`, `web/src/components/Onboarding/FirstRun.tsx`; modify `web/src/pages/Dashboard.tsx`.

Starter picks are names, not ids, so they can't go stale; each is resolved with the existing `searchCatalog` and only shown if found.

- [ ] **Step 1: `starterPicks.ts`**

```ts
import { searchCatalog, type CatalogHit } from "./catalogSearch";

/** Familiar names for a first follow. Resolved against the catalog, so a missing entry simply doesn't show. */
export const STARTER_NAMES = ["Visual Studio Code", "Figma", "Chrome", "macOS", "Node.js", "FL Studio"] as const;

export async function resolveStarterPicks(
  search: (q: string) => Promise<CatalogHit[]> = searchCatalog,
): Promise<CatalogHit[]> {
  const found = await Promise.all(
    STARTER_NAMES.map(async (name) => {
      try {
        const hits = await search(name);
        return hits.find((h) => h.name.toLowerCase() === name.toLowerCase()) ?? hits[0] ?? null;
      } catch {
        return null;
      }
    }),
  );
  return found.filter((h): h is CatalogHit => h !== null);
}
```

Add `web/src/services/starterPicks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveStarterPicks, STARTER_NAMES } from "./starterPicks";

describe("resolveStarterPicks", () => {
  it("drops names the catalog cannot find and survives search errors", async () => {
    const search = async (q: string) => {
      if (q === "Figma") return [{ id: "figma", name: "Figma" }];
      if (q === "Chrome") throw new Error("offline");
      return [];
    };
    const picks = await resolveStarterPicks(search);
    expect(picks.map((p) => p.id)).toEqual(["figma"]);
  });
  it("prefers an exact name match over the first hit", async () => {
    const search = async () => [{ id: "a", name: "Figma Plugin" }, { id: "b", name: "Figma" }];
    const picks = await resolveStarterPicks(search);
    expect(picks.find((p) => p.name === "Figma")?.id).toBe("b");
    expect(STARTER_NAMES.length).toBeGreaterThan(0);
  });
});
```

Run `pnpm test` first and see the import fail, implement, then see it pass (TDD order).

- [ ] **Step 2: `FirstRun.tsx`.** A card with a heading `Welcome to {BRAND.name}`, three numbered steps ("1 Pick software you use", "2 We watch its changelog", "3 You get a notification when something new ships"), a chip row of starter picks (one click follows it, writing the `interests` doc exactly like `addToLibrary` in `AddSoftware.tsx`: id `${uid}_${softwareId}`, fields `userId, softwareId, topic:null, softwareName, type:"software", following:true, createdAt`), and a primary button "Search for something else" linking to the add page. Respect the Free limit with `limitsFor(tier)`. Chips show a check once followed. Use `useAuth()` for `user` and `tier`. Heading is an `h1`-level element on the empty dashboard so the page has one clear title.

Extract the write into `web/src/services/followSoftware.ts` (`followSoftware(uid, hit)`) and call it from both `FirstRun` and `AddSoftware.addToLibrary` so there is one implementation. The existence check (`getDoc`) and deterministic id stay as in the current code.

- [ ] **Step 3: Render it** in the `interests.length === 0 && !loading` branch of `Dashboard.tsx`.

- [ ] **Step 4: Verify** as in Task 6 Step 3 with a brand-new account: the checklist shows, one click on a chip creates one interest and the dashboard leaves the first-run state.

- [ ] **Step 5:** `cd web && pnpm run lint && pnpm test && pnpm run build` → pass.

- [ ] **Step 6: Commit (when asked)** — `git commit -m "feat(web): add first-run checklist with starter picks"`.

---

### Task 8: Stale Vercel references and docs

**Files:** `backend/.vercel/project.json`, `docs/SETUP.md:232`, `docs/STATUS.md:257,303-305`.

The Vercel project `release-update-backend` was deleted by the owner. The API runs on Cloud Run (ADR-0004/0019).

- [ ] **Step 1:** `git ls-files backend/.vercel` — if tracked, `git rm -r backend/.vercel`; if not, delete the local folder and confirm `.gitignore` covers it.
- [ ] **Step 2:** `docs/SETUP.md:232` — replace the sentence about the Vercel deployment with: "The `api` service runs on Cloud Run in `europe-west4` (see ADR-0019). The old Vercel project `release-update-backend` was deleted on 2026-10-28."
- [ ] **Step 3:** `docs/STATUS.md` — change the "Live API host" row to the Cloud Run URL already used by `web/src/services/api.ts`, and reword lines 303-305 so only `web` is described as a Vercel project.
- [ ] **Step 4:** Add a "2026-10-28" entry to `docs/STATUS.md` under Done: Batch 1 items; under Next: Batches 2 and 3, plus "Namecheap DNS for releasescope.com", "Google Auth Platform branding (owner)", "confirm web Vercel project still deployed".
- [ ] **Step 5: Final verification**

Run: `cd web && pnpm run lint && pnpm test && pnpm run build`
Expected: all pass. Report the real test count and any step that was not run.

- [ ] **Step 6: Commit (when asked)** — `git commit -m "docs: record Release Scope rename and remove stale Vercel references"`.
