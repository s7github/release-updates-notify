# Batch 3: Public Site and SEO — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Release Scope a public face on `releasescope.com` that explains the product, shows what to expect after sign-in, and can be found in search.

**Architecture:** Phase A pre-renders a handful of static marketing pages at build time so crawlers receive real HTML (the app today serves one empty shell). Phase B adds public `/software/:slug` pages built from the catalog. The signed-in app stays a client-rendered SPA under `/app`-style routes untouched by SEO concerns.

**Tech Stack:** Vite 6 + React 19 (existing); a small build-time prerender script using `react-dom/server` (no new framework); Vercel static output plus one serverless function for Phase B.

**Branch:** `feat/web-public-site`, cut from `main` after Batch 2.

**Rule for every task (user requirement):** keep SEO in mind. Each public page needs one `h1`, a unique `<title>` (under 60 characters) and meta description (under 160), a canonical URL on `https://releasescope.com`, Open Graph and Twitter tags, descriptive link text, alt text on images, and fast first paint (no layout shift). Names, taglines and descriptions come from `web/src/brand.ts`.

**Structural decision:** this reverses part of ADR-0009 ("web is an admin surface"). Task 1 writes the superseding ADR before any code.

---

## Phase A — Static marketing pages

### Task 1: ADR superseding ADR-0009

**Files:** Create `docs/adr/0022-public-marketing-and-catalog-pages.md`.

- [ ] **Step 1:** Copy `docs/adr/TEMPLATE.md`. Status Accepted, date, **Supersedes: ADR-0009 in part** (the web app remains the admin surface; it also serves public pages). Context: crawlers see an empty shell; users cannot see the product before signing in. Decision: public pages are pre-rendered static HTML; signed-in routes stay client-rendered; public product pages are indexable only when they have real release notes. Alternatives: Next.js migration (large rewrite), separate marketing site (second codebase, second deploy), Vercel prerender service (cost, black box). Consequences: a prerender script to maintain; two kinds of route in one app. Revisit if page count or personalisation grows enough to justify a framework.
- [ ] **Step 2:** Add one line to `docs/adr/README.md` and note in `docs/ARCHITECTURE.md` and `docs/PRODUCT.md` that public pages exist. Do **not** edit ADR-0009.

### Task 2: Route split, page metadata and test

**Files:** Create `web/src/seo/meta.ts`, `web/src/seo/meta.test.ts`; modify `web/src/App.tsx`, `web/index.html`.

- [ ] **Step 1: Failing test** — `meta.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { buildHead } from "./meta";

describe("buildHead", () => {
  const head = buildHead({ path: "/how-it-works", title: "How it works", description: "Pick software. We watch the changelog." });

  it("brands the title and stays under 60 characters", () => {
    expect(head.title).toBe("How it works | Release Scope");
    expect(head.title.length).toBeLessThanOrEqual(60);
  });
  it("builds an absolute canonical URL on the real domain", () => {
    expect(head.canonical).toBe("https://releasescope.com/how-it-works");
  });
  it("normalises the home page canonical to the bare origin", () => {
    expect(buildHead({ path: "/", title: "Home", description: "d" }).canonical).toBe("https://releasescope.com/");
  });
  it("escapes quotes so attributes cannot break out", () => {
    const h = buildHead({ path: "/x", title: 'A "quoted" <title>', description: 'a "b" & c' });
    expect(h.html).not.toContain('"quoted"');
    expect(h.html).toContain("&quot;quoted&quot;");
    expect(h.html).toContain("&amp;");
  });
  it("marks noindex pages", () => {
    expect(buildHead({ path: "/p", title: "t", description: "d", noindex: true }).html).toContain('content="noindex,follow"');
  });
  it("emits Open Graph and Twitter tags", () => {
    const html = head.html;
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain('rel="canonical"');
  });
});
```

- [ ] **Step 2:** `cd web && pnpm test` → FAIL.
- [ ] **Step 3: Implement** — `web/src/seo/meta.ts`

```ts
import { BRAND } from "../brand";

export interface PageMeta {
  path: string;
  title: string;
  description: string;
  noindex?: boolean;
  /** Absolute or root-relative image for social cards. */
  image?: string;
  jsonLd?: object;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildHead(meta: PageMeta) {
  const title = meta.path === "/" ? meta.title : `${meta.title} | ${BRAND.name}`;
  const canonical = `${BRAND.origin}${meta.path}`;
  const image = meta.image ?? `${BRAND.origin}/og-default.png`;
  const robots = meta.noindex ? "noindex,follow" : "index,follow";
  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:site_name" content="${esc(BRAND.name)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ];
  if (meta.jsonLd) tags.push(`<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c")}</script>`);
  return { title, canonical, html: tags.join("\n    ") };
}
```

The home title is passed in full by the caller (for example `Release Scope – See every release the moment it ships`) and is not suffixed.

- [ ] **Step 4:** `pnpm test` → PASS. Fix the "home title" expectation if the home title exceeds 60 characters: shorten the tagline in the call, not the test.

### Task 3: The pages

**Files:** Create `web/src/pages/public/Home.tsx`, `Demo.tsx`, `HowItWorks.tsx`, `Pricing.tsx`, `Privacy.tsx`, `Terms.tsx`, `web/src/pages/public/PublicLayout.tsx`, `web/src/seo/pages.ts`; modify `web/src/App.tsx`.

`pages.ts` is the registry that the router, the prerender script and the sitemap all read, so a page can't exist in one and be missing from another:

```ts
export const PUBLIC_PAGES = [
  { path: "/", title: "Release Scope – See every release the moment it ships", description: "Follow the software you rely on. Release Scope reads changelogs for you and tells you when something genuinely new ships." },
  { path: "/demo", title: "Live demo", description: "See what your Release Scope feed looks like: real-looking releases, summaries and categories, no sign-up needed." },
  { path: "/how-it-works", title: "How it works", description: "Pick the software you use. We watch its changelog and notify you when a new version ships." },
  { path: "/pricing", title: "Pricing", description: "Free tracks 5 items with a 30-day history. Pro and Enterprise are unlimited with full history." },
  { path: "/privacy", title: "Privacy policy", description: "What Release Scope stores, why, and how to delete it." },
  { path: "/terms", title: "Terms of service", description: "The rules for using Release Scope." },
] as const;
```

Content guidance (write real copy; no lorem ipsum):

- **Home:** `h1` "See every release the moment it ships." One-sentence promise, primary button "Get started free" (opens sign-in), secondary "See the demo". Three-step strip (Follow → We watch → You're told) matching the first-run checklist wording from Batch 1. A "what you'll see" product screenshot or a coded feed mock with alt text. Pricing teaser. FAQ with 5 questions, marked up with `FAQPage` JSON-LD.
- **Demo:** the dashboard component rendered with static sample data and a banner "This is sample data. Sign in to follow your own software." Sample data in `web/src/seo/demoData.ts` must be obviously generic (no real vendors' trademarks implied as endorsing; use real product names only for the factual "follows" examples already in the catalog, and label the release text as sample).
- **How it works:** the flow diagram from the plan page as accessible HTML (ordered list + simple SVG with `<title>`). Explain Follow vs Muted, notifications, plan limits.
- **Pricing:** the real tier limits from `entitlements.ts` (read them, don't retype from memory). Do not invent prices; if prices are undecided, show "Free" and "Contact us" and say so.
- **Privacy / Terms:** draft from what the app really stores (see `docs/DATA_MODEL.md`, `docs/SECURITY.md`). Mark clearly in the PR that these are drafts the owner must review; they are not legal advice. Ask the owner for the support/contact address; do not invent one.

- [ ] **Step 1:** Create `PublicLayout.tsx` (header with wordmark link to `/`, nav, footer with legal links, one `<main>`, skip link). Use semantic landmarks. Respect the existing MUI dark theme.
- [ ] **Step 2:** Create each page. Each calls a small `<Seo {...meta}/>` helper that sets `document.title` and head tags at runtime (for navigation after load); the prerender script (Task 4) writes the same tags into the static HTML.
- [ ] **Step 3:** In `App.tsx`, mount public routes before the auth gate so they render for signed-out *and* signed-in visitors. Keep `/` showing Landing/Home when signed out and Dashboard when signed in (current behaviour). Add a "Sign in" button that uses `signInWithGoogle` + `showAuthNotice`.
- [ ] **Step 4: Verify in the browser:** every page loads at its URL, one `h1` each (`document.querySelectorAll('h1').length === 1`), keyboard-only navigation works, and the layout holds at 400 px width. Report results.
- [ ] **Step 5:** `cd web && pnpm run lint && pnpm test && pnpm run build` → pass.

### Task 4: Prerender, sitemap, robots, social image

**Files:** Create `web/scripts/prerender.tsx`, `web/public/robots.txt`, `web/public/og-default.png`, `web/public/favicon.svg`; modify `web/package.json`, `web/vercel.json`.

- [ ] **Step 1: Prerender script.** After `vite build`, for each entry in `PUBLIC_PAGES`: render the page's React tree with `renderToString` inside `StaticRouter`, inject the HTML into the built `dist/index.html` root element and `buildHead(...).html` into `<head>` (replacing the generic tags), and write it to `dist/<path>/index.html` (`dist/index.html` for `/`). Pages must not touch `window`/Firebase during render; guard with `typeof window` or load Firebase only in effects. Because MUI/emotion needs server style extraction, use `@emotion/server`'s `extractCriticalToChunks` (add `@emotion/server`, record in the PR why) or render marketing pages with plain CSS classes; pick the lighter option and say which.
- [ ] **Step 2: Scripts** in `web/package.json`: `"build": "vite build && tsx scripts/prerender.tsx"`.
- [ ] **Step 3: sitemap** generated by the same script into `dist/sitemap.xml` from `PUBLIC_PAGES` (and, in Phase B, the product slugs). `lastmod` from the build date.
- [ ] **Step 4: `robots.txt`**

```
User-agent: *
Allow: /
Disallow: /library
Disallow: /admin
Disallow: /settings
Sitemap: https://releasescope.com/sitemap.xml
```

(Check the real signed-in route names with `grep -n "path=" web/src/App.tsx` before finalising.)

- [ ] **Step 5: `vercel.json`.** Keep the SPA fallback, but **after** static files so `/how-it-works/index.html` is served as-is; Vercel serves existing files before rewrites, so only confirm the order and add long-cache headers for `/assets/*` and `Cache-Control: public, max-age=0, must-revalidate` for HTML. Add security headers already used elsewhere in the repo if any (check; do not invent a CSP that breaks Firebase auth).
- [ ] **Step 6: Social card.** Create a 1200×630 `og-default.png` with the wordmark and tagline. Generate it from an SVG you write, rendered with whatever image tool is available; if none is, say so and ask the owner to supply it rather than shipping a placeholder.
- [ ] **Step 7: Verify the HTML crawlers see.**

```bash
cd web && pnpm run build
```

Then open `dist/how-it-works/index.html` and confirm it contains the page `h1`, its own `<title>`, a canonical on `releasescope.com` and JSON-LD, with JavaScript not needed. Report the output of a quick `grep -c "<h1" dist/*/index.html dist/index.html`.

- [ ] **Step 8: After deploying** (the owner approves; nothing has been deployed from this repo by me): submit `https://releasescope.com/sitemap.xml` in Google Search Console (owner), test pages with Rich Results Test and PageSpeed Insights, and record the results in `docs/STATUS.md`.
- [ ] **Step 9: Commit (when asked)** — `git commit -m "feat(web): public marketing pages with prerendered HTML and sitemap"`.

---

## Phase B — Public software pages (start only after Phase A is live and the owner confirms)

### Task 5: Page data and indexing rule

**Files:** Create `web/api/software/[slug].ts` (Vercel function) or a Cloud Run route (choose with the owner; the backend already holds Firebase credentials, so a Cloud Run read-only route is the safer default), `web/src/pages/public/SoftwarePage.tsx`, tests.

- [ ] **Step 1: Failing test** for `shouldIndex(product)`: true only when the product is `active`, has a vendor/website, and at least 3 release notes with a summary; false otherwise (the page still renders for users but with `noindex,follow`). Thin or empty pages are what Google demotes; this rule is the guard.
- [ ] **Step 2:** Implement the public read (name, vendor, website, icon, latest 10 release notes with date, version, category, summary). No user data; nothing from `users` or `interests`. Respect the Free-plan history window only for signed-in views; public pages show the latest 10 items.
- [ ] **Step 3:** Page layout: `h1` is the product name, a "Follow {name}" button (sign in first), a release list marked up with `SoftwareApplication` JSON-LD and `ItemList`. Canonical `https://releasescope.com/software/<slug>`; slug from the Batch 2 index.
- [ ] **Step 4:** Serve with `Cache-Control: s-maxage=3600, stale-while-revalidate=86400` at the edge so crawlers and visitors don't each hit Firestore (cost gate, ADR-0015/0016). Do not read Firestore per request without caching.
- [ ] **Step 5:** Add indexable slugs to `sitemap.xml` (split into `sitemap-software-N.xml` files of at most 5 000 URLs each with a sitemap index once above that).
- [ ] **Step 6:** Verify with three real products (one rich, one thin, one missing): rich is indexable, thin is `noindex`, missing returns a real 404 status (not a 200 with an error message). Report results.

### Task 6: Update docs

- [ ] `docs/STATUS.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md` (public read shape), `docs/SECURITY.md` (the public read exposes only catalog data; add the check that proves it).
