import { describe, expect, it } from "vitest";
import { buildHead } from "./meta";
import { PUBLIC_PAGES } from "./pages";

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
  it("makes the social image absolute", () => {
    expect(head.html).toContain('content="https://releasescope.com/og-default.png"');
  });
  it("cannot be broken out of by JSON-LD", () => {
    const h = buildHead({ path: "/x", title: "t", description: "d", jsonLd: { a: "</script><b>" } });
    expect(h.html).not.toContain("</script><b>");
  });
});

describe("PUBLIC_PAGES", () => {
  it.each(PUBLIC_PAGES.map((p) => [p.path, p] as const))("%s fits search-result limits", (_path, page) => {
    const head = buildHead(page);
    expect(head.title.length).toBeLessThanOrEqual(60);
    expect(page.description.length).toBeLessThanOrEqual(160);
  });
  it("has unique paths", () => {
    expect(new Set(PUBLIC_PAGES.map((p) => p.path)).size).toBe(PUBLIC_PAGES.length);
  });
});
