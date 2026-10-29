import { describe, expect, it } from "vitest";
import { resolveStarterPicks, STARTER_NAMES } from "./starterPicks";

describe("resolveStarterPicks", () => {
  it("drops names the catalog cannot find and survives search errors", async () => {
    const search = async (q: string) => {
      if (q === "Figma") return [{ id: "figma", name: "Figma" }];
      if (q === "Chrome") throw new Error("offline");
      return [];
    };
    const picks = await resolveStarterPicks(search);
    expect(picks.map((p) => p.id)).toEqual(["figma"]);
  });
  it("prefers an exact name match over the first hit", async () => {
    const search = async () => [{ id: "a", name: "Figma Plugin" }, { id: "b", name: "Figma" }];
    const picks = await resolveStarterPicks(search);
    expect(picks.find((p) => p.name === "Figma")?.id).toBe("b");
    expect(STARTER_NAMES.length).toBeGreaterThan(0);
  });
});
