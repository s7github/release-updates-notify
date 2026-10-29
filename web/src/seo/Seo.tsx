import { useEffect } from "react";
import { buildHead, type PageMeta } from "./meta";

/** Updates the head after client-side navigation; the prerender writes the same tags into the static HTML. */
export default function Seo(meta: PageMeta) {
  const head = buildHead(meta);
  const signature = head.html;
  useEffect(() => {
    document.title = head.title;
    for (const t of head.tags) {
      const [key, value] = Object.entries(t.id)[0] ?? [];
      if (!key || !value) continue;
      let el = document.head.querySelector(`${t.tag}[${key}="${value}"]`);
      if (!el) {
        el = document.createElement(t.tag);
        document.head.appendChild(el);
      }
      for (const [k, v] of Object.entries(t.attrs)) el.setAttribute(k, v);
    }
    const old = document.head.querySelector('script[data-seo="ld"]');
    old?.remove();
    if (meta.jsonLd) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.seo = "ld";
      script.textContent = JSON.stringify(meta.jsonLd);
      document.head.appendChild(script);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return null;
}
