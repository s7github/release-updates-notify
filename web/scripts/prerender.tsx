/**
 * Runs after `vite build` (ADR-0022). For every public page it renders the React
 * tree to HTML and writes it, with that page's own head tags, to dist/<path>/index.html,
 * so crawlers get real content without running JavaScript. Also writes sitemap.xml
 * and app.html, the un-rendered shell that every signed-in route falls back to.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { BRAND } from "../src/brand";
import { PUBLIC_ROUTES } from "../src/pages/public/routes";
import { buildHead, webPageJsonLd } from "../src/seo/meta";
import { PUBLIC_PAGES } from "../src/seo/pages";

const dist = join(process.cwd(), "dist");
const template = readFileSync(join(dist, "index.html"), "utf8");

if (!template.includes('<div id="root"></div>')) throw new Error("dist/index.html has no empty #root to fill");

/** Drops the generic tags from index.html so each page carries exactly one title and description. */
function withoutGenericHead(html: string): string {
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+name="description"[^>]*>\s*/i, "");
}

const favicon = '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />';

function page(headHtml: string, body: string): string {
  return withoutGenericHead(template)
    .replace("</head>", `    ${favicon}\n    ${headHtml}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}

// The shell for signed-in routes: nothing to index, and no flash of marketing copy.
writeFileSync(
  join(dist, "app.html"),
  page(
    `<title>${BRAND.name}</title>\n    <meta name="robots" content="noindex,nofollow" />`,
    "",
  ),
);

for (const meta of PUBLIC_PAGES) {
  const route = PUBLIC_ROUTES[meta.path];
  if (!route) throw new Error(`PUBLIC_PAGES has ${meta.path} but PUBLIC_ROUTES does not`);
  const body = renderToString(
    <StaticRouter location={meta.path}>
      <route.Component />
    </StaticRouter>,
  );
  const head = buildHead({ ...meta, jsonLd: route.jsonLd ?? webPageJsonLd(meta) });
  const file = meta.path === "/" ? join(dist, "index.html") : join(dist, meta.path, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, page(head.html, body));
}

const lastmod = new Date().toISOString().slice(0, 10);
const urls = PUBLIC_PAGES.filter((p) => !p.noindex)
  .map((p) => `  <url><loc>${BRAND.origin}${p.path}</loc><lastmod>${lastmod}</lastmod></url>`)
  .join("\n");
writeFileSync(
  join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);

console.log(`prerendered ${PUBLIC_PAGES.length} pages, app.html and sitemap.xml`);
