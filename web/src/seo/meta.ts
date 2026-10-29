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

export interface HeadTag {
  tag: "meta" | "link";
  /** The attribute that identifies the tag, so a runtime update can find and replace it. */
  id: { name?: string; property?: string; rel?: string };
  attrs: Record<string, string>;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** JSON for a <script> body: `<` becomes a unicode escape so the data cannot close the tag. */
const jsonForScript = (value: object) =>
  JSON.stringify(value).replace(/</g, `${String.fromCharCode(92)}u003c`);

/** Minimal structured data for pages that do not define their own. */
export const webPageJsonLd = (meta: Pick<PageMeta, "path" | "title" | "description">) => ({
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: meta.title,
  description: meta.description,
  url: `${BRAND.origin}${meta.path}`,
  isPartOf: { "@type": "WebSite", name: BRAND.name, url: `${BRAND.origin}/` },
});

const absolute = (image: string) => (image.startsWith("http") ? image : `${BRAND.origin}${image}`);

export function buildHead(meta: PageMeta) {
  const title = meta.path === "/" ? meta.title : `${meta.title} | ${BRAND.name}`;
  const canonical = `${BRAND.origin}${meta.path}`;
  const image = absolute(meta.image ?? "/og-default.png");
  const robots = meta.noindex ? "noindex,follow" : "index,follow";

  const tags: HeadTag[] = [
    { tag: "meta", id: { name: "description" }, attrs: { name: "description", content: meta.description } },
    { tag: "meta", id: { name: "robots" }, attrs: { name: "robots", content: robots } },
    { tag: "link", id: { rel: "canonical" }, attrs: { rel: "canonical", href: canonical } },
    { tag: "meta", id: { property: "og:site_name" }, attrs: { property: "og:site_name", content: BRAND.name } },
    { tag: "meta", id: { property: "og:type" }, attrs: { property: "og:type", content: "website" } },
    { tag: "meta", id: { property: "og:title" }, attrs: { property: "og:title", content: title } },
    { tag: "meta", id: { property: "og:description" }, attrs: { property: "og:description", content: meta.description } },
    { tag: "meta", id: { property: "og:url" }, attrs: { property: "og:url", content: canonical } },
    { tag: "meta", id: { property: "og:image" }, attrs: { property: "og:image", content: image } },
    { tag: "meta", id: { name: "twitter:card" }, attrs: { name: "twitter:card", content: "summary_large_image" } },
    { tag: "meta", id: { name: "twitter:title" }, attrs: { name: "twitter:title", content: title } },
    { tag: "meta", id: { name: "twitter:description" }, attrs: { name: "twitter:description", content: meta.description } },
    { tag: "meta", id: { name: "twitter:image" }, attrs: { name: "twitter:image", content: image } },
  ];

  const toHtml = (t: HeadTag) =>
    `<${t.tag} ${Object.entries(t.attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(" ")} />`;
  const parts = [`<title>${esc(title)}</title>`, ...tags.map(toHtml)];
  if (meta.jsonLd) {
    parts.push(`<script type="application/ld+json">${jsonForScript(meta.jsonLd)}</script>`);
  }
  return { title, canonical, tags, html: parts.join("\n    ") };
}
