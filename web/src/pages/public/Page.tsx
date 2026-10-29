import type { ReactNode } from "react";
import { webPageJsonLd } from "../../seo/meta";
import Seo from "../../seo/Seo";
import { PUBLIC_PAGES } from "../../seo/pages";
import PublicLayout from "./PublicLayout";

/** Wraps a public page with the shared layout and its registry metadata (seo/pages.ts). */
export default function Page({ path, jsonLd, children }: { path: string; jsonLd?: object; children: ReactNode }) {
  const meta = PUBLIC_PAGES.find((p) => p.path === path);
  if (!meta) throw new Error(`No entry in PUBLIC_PAGES for ${path}`);
  return (
    <PublicLayout>
      <Seo {...meta} jsonLd={jsonLd ?? webPageJsonLd(meta)} />
      {children}
    </PublicLayout>
  );
}

export const H1 = ({ children }: { children: ReactNode }) => (
  <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{children}</h1>
);
export const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="mb-3 mt-10 text-2xl font-bold tracking-tight">{children}</h2>
);
