# Batch 2: Branded Sign-in and Autocomplete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users see "Release Scope" and `releasescope.com` (not a Google Cloud project id) while signing in, and search suggests names as they type, including for typos.

**Architecture:** Sign-in: brand the Google OAuth consent screen (console, owner) and serve Firebase's auth handler from `auth.releasescope.com` (Vercel rewrite is not needed; see Task 3). Search: the backend publishes a compact `catalog-index.json`; the browser downloads it once, caches it, and matches locally with typo tolerance (pure function, tested). Firestore prefix search stays as the fallback for entries newer than the index.

**Tech Stack:** Vitest (added in Batch 1), React 19, MUI 9 `Autocomplete`, Cloud Storage or Firestore-hosted JSON for the index (decide in Task 4).

**Branch:** `feat/web-signin-and-search`, cut from `main` after Batch 1 is merged.

**Public-site note:** the same index feeds Batch 3 (`sitemap.xml` and `/software/:slug` pages). Keep each entry's `slug` stable; never derive it from a display name that can change.

---

## Part A — Sign-in screen

### Task 1: Brand the Google consent screen (owner does this in the console)

Nothing in code. I cannot see the owner's Google Cloud console, so these are the owner's steps; I verify the result by signing in and reading the screen.

- [ ] **Step 1:** Google Cloud console → project `gen-lang-client-0099813375` → **Google Auth Platform → Branding**.
- [ ] **Step 2:** App name `Release Scope`; user support email (the owner's choice); app logo (square PNG, 120×120 px or larger, the reticle mark from ADR-0020); **Application home page** `https://releasescope.com`; privacy policy and terms links `https://releasescope.com/privacy` and `/terms` (these pages are built in Batch 3, so do this step after Batch 3 Task 4, or temporarily use the pages once they exist).
- [ ] **Step 3:** **Authorized domains:** add `releasescope.com`.
- [ ] **Step 4:** **Audience:** change publishing status from *Testing* to *In production* so any Google account can sign in. Basic scopes (name, email, profile) need no Google review.
- [ ] **Step 5:** Sign in with a fresh Google account on the live site and screenshot the screen. Expected: "Sign in to Release Scope" or "to continue to Release Scope"; no `firebaseapp.com`.

### Task 2: Namecheap DNS and Vercel domain (owner + me)

- [ ] **Step 1:** In the Vercel `web` project → Domains → add `releasescope.com` and `www.releasescope.com` (redirect www to the apex). Vercel shows the exact records to create. (Vercel MCP is not authorised in this session; either the owner authorises it with `/mcp` or does this in the dashboard.)
- [ ] **Step 2:** Namecheap → Domain List → Manage → **Advanced DNS** → add the records Vercel shows (typically an `A` record for `@` and a `CNAME` for `www`). Remove Namecheap's parking-page records first, or the site won't resolve.
- [ ] **Step 3:** Wait for Vercel to show the domain as valid and the certificate as issued. Check: open `https://releasescope.com` and confirm the app loads over HTTPS.

### Task 3: Serve Firebase auth from the branded domain

Why: the title "Sign in to gen-lang-client-0099813375.firebaseapp.com" is Firebase's `authDomain`. Pointing `authDomain` at our own domain removes it and is also the setup Firebase recommends so redirect sign-in keeps working in browsers that block third-party storage.

**Files:** `web/firebase-applet-config.json`, `web/vercel.json`, `web/src/services/firebase.ts` (comment only).

- [ ] **Step 1: Authorize the domain in Firebase.** Firebase console → Authentication → Settings → **Authorized domains** → add `releasescope.com` and `www.releasescope.com`. The old `*.firebaseapp.com` entry stays until the switch is verified.
- [ ] **Step 2: Add the redirect URI in Google Cloud.** Google Cloud → APIs & Services → Credentials → the OAuth 2.0 *Web client* used by Firebase → **Authorized redirect URIs** → add `https://releasescope.com/__/auth/handler`. (Keep the existing `https://gen-lang-client-0099813375.firebaseapp.com/__/auth/handler` until verified.)
- [ ] **Step 3: Proxy the handler.** Firebase's helper files live at `https://<project>.firebaseapp.com/__/auth/*`. Add this rewrite to `web/vercel.json`, **above** the catch-all that sends everything to `index.html`:

```json
{ "source": "/__/auth/:path*", "destination": "https://gen-lang-client-0099813375.firebaseapp.com/__/auth/:path*" }
```

Also proxy `/__/firebase/init.json` the same way (destination `…/__/firebase/init.json`).

- [ ] **Step 4: Switch `authDomain`.** In `web/firebase-applet-config.json` set `"authDomain": "releasescope.com"`. This file is public by design (CLAUDE.md §7).
- [ ] **Step 5: Verify before telling the owner it works.** On the live site, in a private window: sign in with popup; then force the redirect path (block pop-ups for the site) and sign in again; then cancel once. Expected: branded title, both paths complete, cancel gives the grey line from Batch 1. If either path fails, revert Step 4 (one-line change) and report the exact error.
- [ ] **Step 6: Local development.** `localhost` must stay in Authorized domains; the `__/auth` rewrite does not exist on the dev server, so keep `authDomain` overridable: in `firebase.ts` use `import.meta.env.VITE_AUTH_DOMAIN ?? firebaseConfig.authDomain` and document `VITE_AUTH_DOMAIN=gen-lang-client-0099813375.firebaseapp.com` in `web/.env.example` for local runs. Run `pnpm run lint`.
- [ ] **Step 7: Commit (when asked)** — `git commit -m "feat(web): serve sign-in from releasescope.com"`.

---

## Part B — Autocomplete with typo suggestions

### Task 4: Matching engine (pure, tested)

**Files:** Create `web/src/services/suggest.ts`, `web/src/services/suggest.test.ts`.

- [ ] **Step 1: Failing tests** — `suggest.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { editDistance, suggest, type IndexEntry } from "./suggest";

const entry = (id: string, name: string): IndexEntry => ({
  id,
  name,
  key: name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
});
const entries = [
  entry("figma", "Figma"),
  entry("fl-studio", "FL Studio"),
  entry("studio-one", "Studio One"),
  entry("vscode", "Visual Studio Code"),
  entry("node", "Node.js"),
];

describe("editDistance", () => {
  it("counts a swap as one edit", () => expect(editDistance("figam", "figma", 2)).toBe(1));
  it("handles insert, delete, replace", () => expect(editDistance("kitten", "sitting", 5)).toBe(3));
  it("gives up early past the limit", () => expect(editDistance("abcdef", "uvwxyz", 2)).toBeGreaterThan(2));
});

describe("suggest", () => {
  it("returns prefix matches first", () => {
    const out = suggest(entries, "fl s");
    expect(out[0].entry.id).toBe("fl-studio");
    expect(out[0].kind).toBe("prefix");
  });
  it("matches a later word", () => {
    const ids = suggest(entries, "studio").map((s) => s.entry.id);
    expect(ids).toEqual(expect.arrayContaining(["fl-studio", "studio-one", "vscode"]));
    expect(suggest(entries, "studio")[0].entry.id).toBe("studio-one"); // prefix beats word match
  });
  it("tolerates a typo", () => {
    const out = suggest(entries, "figam");
    expect(out[0].entry.id).toBe("figma");
    expect(out[0].kind).toBe("fuzzy");
  });
  it("tolerates a missing space", () => {
    expect(suggest(entries, "flstudio")[0].entry.id).toBe("fl-studio");
  });
  it("does not suggest unrelated names", () => {
    expect(suggest(entries, "zzzzzz")).toEqual([]);
  });
  it("ignores input shorter than 2 characters", () => {
    expect(suggest(entries, "f")).toEqual([]);
  });
  it("respects the limit", () => {
    expect(suggest(entries, "s", 1)).toEqual([]); // too short
    expect(suggest(entries, "st", 2).length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2:** `cd web && pnpm test` → FAIL (module missing).

- [ ] **Step 3: Implement** — `suggest.ts`

```ts
import { normaliseSearch } from "./catalogSearch";

export interface IndexEntry {
  id: string;
  name: string;
  /** normaliseSearch(name), precomputed by the index builder. */
  key: string;
  slug?: string;
  vendor?: string | null;
}

export type SuggestKind = "prefix" | "word" | "fuzzy";
export interface Suggestion { entry: IndexEntry; kind: SuggestKind; score: number }

/** Optimal-string-alignment distance (insert, delete, replace, adjacent swap). Returns max+1 once the limit is exceeded. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prevPrev: number[] | null = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prevPrev && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prevPrev[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = cur;
  }
  return prev[b.length];
}

const allowedEdits = (len: number) => (len <= 3 ? 0 : len <= 5 ? 1 : 2);

export function suggest(entries: readonly IndexEntry[], raw: string, limit = 8): Suggestion[] {
  const needle = normaliseSearch(raw);
  if (needle.length < 2) return [];
  const compactNeedle = needle.replace(/ /g, "");
  const maxEdits = allowedEdits(compactNeedle.length);
  const out: Suggestion[] = [];

  for (const entry of entries) {
    const key = entry.key;
    if (key.startsWith(needle)) {
      out.push({ entry, kind: "prefix", score: key.length });
      continue;
    }
    const compact = key.replace(/ /g, "");
    if (compact.startsWith(compactNeedle)) {
      out.push({ entry, kind: "prefix", score: 100 + key.length });
      continue;
    }
    const tokens = key.split(" ");
    if (tokens.some((t, i) => i > 0 && t.startsWith(needle))) {
      out.push({ entry, kind: "word", score: 1000 + key.length });
      continue;
    }
    if (maxEdits > 0) {
      const candidates = [compact.slice(0, compactNeedle.length), ...tokens];
      let best = maxEdits + 1;
      for (const c of candidates) best = Math.min(best, editDistance(compactNeedle, c, maxEdits));
      if (best <= maxEdits) out.push({ entry, kind: "fuzzy", score: 2000 + best * 100 + key.length });
    }
  }
  return out.sort((a, b) => a.score - b.score).slice(0, limit);
}
```

- [ ] **Step 4:** `pnpm test` → PASS. If the "studio" ordering test fails, the expected order is *Studio One* (prefix) before *FL Studio* and *Visual Studio Code* (word); fix the scoring, not the test.

### Task 5: Build and publish the index (backend)

**Files:** Create `backend/src/jobs/buildCatalogIndex.ts` and its test (inspect `backend/src` first for the existing job/route layout and mirror it); modify `docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md`.

Decision recorded here: the browser reads **one JSON file**, not Firestore, so typing costs zero reads (the cost gate from ADR-0015/0016). Entry shape: `{ id, name, key, slug, vendor }`, about 10 bytes of overhead per entry; about 15 000 entries is roughly 1 MB raw, 150 to 250 KB gzipped. Check the real number after the first build and record it.

- [ ] **Step 1:** Read `backend/src/lib/searchKey.ts` and one existing scheduled job to copy the pattern; read `docs/adr/0015-seed-catalog-from-public-catalogs.md` for the registry shape and `active` flag.
- [ ] **Step 2: Failing test** for a pure `toIndexEntries(docs)` that drops `active === false`, drops topics without a name, computes `key` with `normaliseSearch`, and creates a unique stable `slug` (kebab-case of the name; on collision append `-` plus the first 6 characters of the id). Run `cd backend && pnpm test` → FAIL.
- [ ] **Step 3:** Implement `toIndexEntries`, then the job: read `master_registry` with a projection of `name, vendor, active, searchKey`, build the entries, write `catalog-index.json` to a public Cloud Storage object (or a Firestore doc chunked under 1 MB if the owner prefers no bucket; ask before creating one) with `Cache-Control: public, max-age=3600`, and record `{ builtAt, count }`. Run it after seeding and then daily.
- [ ] **Step 4:** Add the job to the existing scheduler configuration, `launchers.json` if it is a runnable task, and `docs/ARCHITECTURE.md`. Add the new object and fields to `docs/DATA_MODEL.md` in the same commit.
- [ ] **Step 5:** `cd backend && pnpm run lint && pnpm test && pnpm run build` → pass. Deploying is a separate step the owner approves (nothing in this repo has been deployed from this session).

### Task 6: Load the index and build the combobox

**Files:** Create `web/src/services/catalogIndex.ts`, `web/src/components/Library/SoftwareSearch.tsx`; modify `web/src/pages/AddSoftware.tsx`.

- [ ] **Step 1: `catalogIndex.ts`** — `loadCatalogIndex(): Promise<IndexEntry[]>`: fetch the index URL (from `VITE_CATALOG_INDEX_URL`, documented in `.env.example`), keep it in a module-level promise, and mirror it in `localStorage` under `rs.catalogIndex.v1` with `builtAt` so a returning visitor starts instantly and refreshes in the background. Wrap every storage call in try/catch. On fetch failure resolve `[]` so the page falls back to Firestore prefix search.
- [ ] **Step 2: `SoftwareSearch.tsx`** — MUI `Autocomplete` (`freeSolo`, `filterOptions={(x) => x}` so our ranking is used). Debounce input 80 ms; options = `suggest(index, input, 8)`; typo results render under a heading "Did you mean…?" (use `groupBy` on `kind === "fuzzy"`); each option shows the name, vendor in secondary text and a **Follow** button reachable by keyboard. Keep accessibility defaults from MUI (`role="combobox"`, `aria-expanded`, `aria-activedescendant`); add a visible label "Search for software". Pressing Enter with no highlighted option runs the existing `searchCatalog` so a name newer than the index is still found; the existing "Find sources" AI button stays as the last resort.
- [ ] **Step 3:** Replace the `TextField` + Search button block in `AddSoftware.tsx` (lines 171-200) with `<SoftwareSearch … />`, passing `onFollow={addToLibrary}` and the free-text fallback `onSubmitText={handleSearch}`.
- [ ] **Step 4: Verify in the browser.** Type `figam`, `vs cod`, `flstudio`, `nodjs`, and a name that exists only in Firestore; confirm suggestions, keyboard navigation (arrow keys, Enter, Escape), and that no Firestore reads happen while typing (network panel). Report what you actually saw.
- [ ] **Step 5:** `cd web && pnpm run lint && pnpm test && pnpm run build` → pass.
- [ ] **Step 6: Commit (when asked)** — `git commit -m "feat(web): autocomplete with typo suggestions"`.

### Task 7: Docs and status

- [ ] Record the index decision in a new ADR `docs/adr/0021-client-side-catalog-index.md` (Context: no fuzzy matching in Firestore and per-keystroke reads are a cost risk; Decision: static index plus local matching; Alternatives: Algolia/Typesense (cost, new vendor), Firestore only (no typo tolerance); Revisit if the index passes about 1 MB gzipped).
- [ ] Update `docs/STATUS.md` (Done / Next) and re-run all verify commands from `CLAUDE.md` §6 that apply.
