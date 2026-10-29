/**
 * The registry of public pages. The router, the prerender script and the sitemap
 * all read it, so a page cannot exist in one and be missing from another.
 * See docs/adr/0022-public-marketing-and-catalog-pages.md.
 */
export interface PublicPage {
  path: string;
  title: string;
  description: string;
  /** Keep the page out of the index (and out of the sitemap). */
  noindex?: boolean;
}

export const PUBLIC_PAGES: readonly PublicPage[] = [
  {
    path: "/",
    title: "Release Scope – See every release the moment it ships",
    description:
      "Follow the software you rely on. Release Scope reads changelogs for you and tells you when something genuinely new ships.",
  },
  {
    path: "/demo",
    title: "Live demo",
    description: "See what your Release Scope feed looks like: sample releases, summaries and categories, no sign-up needed.",
  },
  {
    path: "/how-it-works",
    title: "How it works",
    description: "Pick the software you use. We watch its changelog and notify you when a new version ships.",
  },
  {
    path: "/pricing",
    title: "Pricing",
    description: "Free tracks 5 items with a 30-day history. Pro and Enterprise are unlimited with full history.",
  },
  { path: "/privacy", title: "Privacy policy", description: "What Release Scope stores, why, and how to have it deleted." },
  { path: "/terms", title: "Terms of service", description: "The rules for using Release Scope." },
];
