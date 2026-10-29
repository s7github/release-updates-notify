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
