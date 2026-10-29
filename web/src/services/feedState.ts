export type FeedState = "no-library" | "none-followed" | "nothing-yet" | "filtered-out" | "has-releases";

export interface FeedInputs {
  /** All interests, software and topics. */
  interestCount: number;
  /** Software interests with following === true. */
  followedCount: number;
  /** Release notes loaded for the library (before tab/date/category filters). */
  releaseCount: number;
  /** Release cards that survive every filter on the current tab. */
  visibleCount: number;
}

export function feedState(i: FeedInputs): FeedState {
  if (i.interestCount === 0) return "no-library";
  if (i.followedCount === 0) return "none-followed";
  if (i.releaseCount === 0) return "nothing-yet";
  if (i.visibleCount === 0) return "filtered-out";
  return "has-releases";
}

interface CountInterest { type?: string; following?: boolean; softwareId?: string }

/**
 * Derive feedState inputs from the raw library. Only SOFTWARE interests count
 * (a topic-only library has nothing to watch), and only releases of followed
 * software count (muted items' releases must not hide the "nothing yet" state).
 */
export function countFeedInputs(
  interests: CountInterest[],
  releases: { softwareId?: string }[],
): Pick<FeedInputs, "interestCount" | "followedCount" | "releaseCount"> {
  const software = interests.filter((i) => i.type === "software");
  const followedIds = new Set(software.filter((i) => i.following === true).map((i) => i.softwareId));
  return {
    interestCount: software.length,
    followedCount: followedIds.size,
    releaseCount: releases.filter((r) => followedIds.has(r.softwareId)).length,
  };
}
