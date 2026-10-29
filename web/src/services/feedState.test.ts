import { describe, expect, it } from "vitest";
import { countFeedInputs, feedState } from "./feedState";

const base = { interestCount: 3, followedCount: 2, releaseCount: 8, visibleCount: 4 };

describe("feedState", () => {
  it("empty library", () => {
    expect(feedState({ ...base, interestCount: 0, followedCount: 0, releaseCount: 0, visibleCount: 0 })).toBe("no-library");
  });
  it("library has items but none are followed", () => {
    expect(feedState({ ...base, followedCount: 0, releaseCount: 0, visibleCount: 0 })).toBe("none-followed");
  });
  it("followed, but nothing has been published yet", () => {
    expect(feedState({ ...base, releaseCount: 0, visibleCount: 0 })).toBe("nothing-yet");
  });
  it("releases exist but filters or the plan window hide them", () => {
    expect(feedState({ ...base, visibleCount: 0 })).toBe("filtered-out");
  });
  it("normal feed", () => {
    expect(feedState(base)).toBe("has-releases");
  });
});

describe("countFeedInputs", () => {
  const sw = (id: string, following: boolean) => ({ type: "software", softwareId: id, following });
  it("normal library", () => {
    expect(countFeedInputs([sw("a", true), sw("b", false), { type: "topic" }], [{ softwareId: "a" }, { softwareId: "b" }]))
      .toEqual({ interestCount: 2, followedCount: 1, releaseCount: 1 });
  });
  it("ignores releases that belong only to muted software", () => {
    const c = countFeedInputs([sw("a", true), sw("b", false)], [{ softwareId: "b" }]);
    expect(c.releaseCount).toBe(0);
    expect(feedState({ ...c, visibleCount: 0 })).toBe("nothing-yet");
  });
  it("topic-only library has no software interests", () => {
    const c = countFeedInputs([{ type: "topic" }, { type: "topic" }], []);
    expect(c).toEqual({ interestCount: 0, followedCount: 0, releaseCount: 0 });
    expect(feedState({ ...c, visibleCount: 0 })).toBe("no-library");
  });
});
