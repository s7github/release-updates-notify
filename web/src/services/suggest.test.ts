import { describe, expect, it } from "vitest";
import { editDistance, suggest, type IndexEntry } from "./suggest";

const entry = (id: string, name: string): IndexEntry => ({
  id,
  name,
  key: name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
  slug: id,
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
  it("tolerates a typo in a longer name", () => {
    expect(suggest(entries, "nodjs")[0].entry.id).toBe("node");
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
