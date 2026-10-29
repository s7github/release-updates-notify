import { Box, Button, Paper, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import type { FeedState } from "../../services/feedState";

const ADD_ROUTE = "/library/add";

interface Props {
  state: Exclude<FeedState, "has-releases">;
  tab: "following" | "muted";
  libraryCount: number;
  /** Software items in the library that are not followed (the Muted tab's contents). */
  mutedCount: number;
  onFollowAll: () => void;
  onShowWiderRange: () => void;
  /** False when "show the full window" would change nothing (already widest, no filters). */
  canWiden: boolean;
  /** Free plans are capped to a 30-day window; used to explain an empty window. */
  isFree: boolean;
}

interface Copy { title: string; body: string; cta?: { label: string; to?: string; onClick?: () => void } }

export default function EmptyFeed({ state, tab, libraryCount, mutedCount, onFollowAll, onShowWiderRange, canWiden, isFree }: Props) {
  const copy = describe(state, tab, libraryCount, mutedCount, onFollowAll, onShowWiderRange, canWiden, isFree);
  return (
    <Paper sx={{ textAlign: "center", py: 10, px: 3, borderRadius: 4, border: "1px dashed rgba(255,255,255,0.1)", bgcolor: "rgba(255,255,255,0.02)" }}>
      <Typography variant="h5" component="h2" sx={{ fontWeight: 800, mb: 1 }}>{copy.title}</Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 480, mx: "auto", mb: copy.cta ? 4 : 0 }}>
        {copy.body}
      </Typography>
      {copy.cta && (
        <Box>
          {copy.cta.to ? (
            <Button component={Link} to={copy.cta.to} variant="contained" size="large" sx={{ borderRadius: 100, px: 4 }}>{copy.cta.label}</Button>
          ) : (
            <Button onClick={copy.cta.onClick} variant="contained" size="large" sx={{ borderRadius: 100, px: 4 }}>{copy.cta.label}</Button>
          )}
        </Box>
      )}
    </Paper>
  );
}

function describe(
  state: Props["state"], tab: Props["tab"], count: number, mutedCount: number,
  onFollowAll: () => void, onShowWiderRange: () => void, canWiden: boolean, isFree: boolean,
): Copy {
  if (tab === "muted") {
    if (mutedCount === 0) {
      return { title: "Nothing is muted", body: "Everything in your library is on the Following tab. Mute an item there to keep it saved without notifications." };
    }
    return { title: "No muted releases match", body: "Your muted items haven't shipped anything in this date range or category." };
  }
  switch (state) {
    case "no-library":
      return { title: "Follow your first piece of software", body: "Pick something you use. We'll watch its changelog and show every new release here.", cta: { label: "Find software to follow", to: ADD_ROUTE } };
    case "none-followed":
      if (count === 0) return { title: "Follow your first piece of software", body: "Pick something you use. We'll watch its changelog and show every new release here.", cta: { label: "Find software to follow", to: ADD_ROUTE } };
      return {
        title: "You're not following anything right now",
        body: `You have ${count} saved ${count === 1 ? "item" : "items"} in your library, but none of them are followed. Follow them to get their updates here, or add something new.`,
        cta: { label: count === 1 ? "Follow it" : `Follow all ${count}`, onClick: onFollowAll },
      };
    case "nothing-yet":
      return { title: "Nothing has shipped yet", body: "We're watching what you follow. New releases appear here the moment they're published, usually within the hour.", cta: { label: "Follow more software", to: ADD_ROUTE } };
    case "filtered-out":
      if (!canWiden) {
        return {
          title: "No releases in this window",
          body: isFree
            ? "Your Free plan shows the last 30 days; Pro shows the full history."
            : "There are releases for what you follow, but none in this date range.",
        };
      }
      return { title: "No releases match these filters", body: "There are releases for what you follow, but not in this date range or category.", cta: { label: "Show the full window", onClick: onShowWiderRange } };
  }
}
