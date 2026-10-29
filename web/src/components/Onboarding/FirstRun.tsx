import { useEffect, useState } from "react";
import { Box, Button, Chip, CircularProgress, Paper, Typography } from "@mui/material";
import { Check, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../../App";
import { BRAND } from "../../brand";
import { limitsFor, tierLabel } from "../../services/entitlements";
import { followSoftware } from "../../services/followSoftware";
import { resolveStarterPicks } from "../../services/starterPicks";
import type { CatalogHit } from "../../services/catalogSearch";

const ADD_ROUTE = "/library/add";

const STEPS = [
  "Pick software you use",
  "We watch its changelog",
  "You get a notification when something new ships",
];

export default function FirstRun() {
  const { user, tier, isAdmin } = useAuth();
  const [picks, setPicks] = useState<CatalogHit[]>([]);
  const [loadingPicks, setLoadingPicks] = useState(true);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveStarterPicks()
      .then((found) => { if (!cancelled) setPicks(found); })
      .finally(() => { if (!cancelled) setLoadingPicks(false); });
    return () => { cancelled = true; };
  }, []);

  const limits = limitsFor(tier);
  const atLimit = !isAdmin && limits.maxTrackedItems !== null && followed.size >= limits.maxTrackedItems;

  const follow = async (hit: CatalogHit) => {
    if (!user || busy || followed.has(hit.id)) return;
    if (atLimit) {
      toast.error(`The ${tierLabel(tier)} plan lets you follow up to ${limits.maxTrackedItems} items. Remove one or upgrade.`);
      return;
    }
    setBusy(hit.id);
    try {
      const result = await followSoftware(user.uid, hit);
      setFollowed((prev) => new Set(prev).add(hit.id));
      if (result.ok) toast.success(`Following ${hit.name}`);
      else toast.error(`You already follow "${hit.name}"`);
    } catch (e) {
      console.error("Follow failed", e);
      toast.error("Failed to add to library");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Paper sx={{ textAlign: "center", py: 8, px: 3, borderRadius: 4, border: "1px dashed rgba(255,255,255,0.1)", bgcolor: "rgba(255,255,255,0.02)" }}>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 800, mb: 1 }}>
        Welcome to {BRAND.name}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 480, mx: "auto", mb: 4 }}>
        {BRAND.tagline} Here is how it works.
      </Typography>

      <Box
        component="ol"
        sx={{
          listStyle: "none", p: 0, m: 0, mb: 5, display: "flex", flexDirection: { xs: "column", md: "row" },
          gap: 2, justifyContent: "center", maxWidth: 840, mx: "auto", counterReset: "step",
        }}
      >
        {STEPS.map((text, i) => (
          <Box
            component="li"
            key={text}
            sx={{
              flex: 1, display: "flex", alignItems: "center", gap: 1.5, textAlign: "left", p: 2,
              borderRadius: 3, border: "1px solid rgba(255,255,255,0.06)", bgcolor: "rgba(255,255,255,0.02)",
            }}
          >
            <Box
              aria-hidden
              sx={{
                width: 28, height: 28, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center",
                bgcolor: "primary.main", color: "primary.contrastText", fontWeight: 800, fontSize: "0.85rem",
              }}
            >
              {i + 1}
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{text}</Typography>
          </Box>
        ))}
      </Box>

      <Typography variant="subtitle2" component="h2" color="text.secondary" sx={{ fontWeight: 700, mb: 2 }}>
        Start with a popular pick
      </Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center", minHeight: 40, mb: 4 }}>
        {loadingPicks && <CircularProgress size={22} aria-label="Loading suggestions" />}
        {picks.map((hit) => {
          const isFollowed = followed.has(hit.id);
          return (
            <Chip
              key={hit.id}
              label={isFollowed ? `${hit.name} (following)` : hit.name}
              onClick={() => follow(hit)}
              disabled={busy !== null && busy !== hit.id}
              icon={isFollowed ? <Check size={16} /> : <Plus size={16} />}
              color={isFollowed ? "success" : "default"}
              variant={isFollowed ? "filled" : "outlined"}
              sx={{ fontWeight: 600 }}
            />
          );
        })}
      </Box>

      <Button component={Link} to={ADD_ROUTE} variant="contained" size="large" sx={{ borderRadius: 100, px: 4 }}>
        Search for something else
      </Button>
    </Paper>
  );
}
