import { useEffect, useState } from "react";
import { 
  Container, Typography, Box, TextField, 
  Paper, Avatar, IconButton, CircularProgress, Button, Grid, Chip, Alert
} from "@mui/material";
import { collection, query, where, getDocs, doc, getDoc, setDoc, limit, onSnapshot } from "firebase/firestore";
import { Search as SearchIcon, ArrowLeft, Plus, Globe, ExternalLink, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../App";
import { db } from "../services/firebase";
import { limitsFor, tierLabel } from "../services/entitlements";
import { userApi, ApiError } from "../services/api";
import { searchCatalog } from "../services/catalogSearch";
import { followSoftware } from "../services/followSoftware";
import SoftwareSearch from "../components/Library/SoftwareSearch";
import toast from "react-hot-toast";
import { motion } from "motion/react";

interface SearchItem {
  id: string;
  name: string;
  vendor?: string | null;
  website?: string | null;
  icon_url?: string | null;
  type?: "software" | "topic";
  isNew?: boolean;
}

export default function AddSoftware() {
  const { user, tier, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [val, setVal] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [trackedCount, setTrackedCount] = useState(0);

  const limits = limitsFor(tier);
  const atLimit = !isAdmin && limits.maxTrackedItems !== null && trackedCount >= limits.maxTrackedItems;

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      query(collection(db, "interests"), where("userId", "==", user.uid)),
      (snap) => setTrackedCount(snap.size),
      () => setTrackedCount(0),
    );
  }, [user]);

  /** Prefix + whole-word search over the whole catalog (services/catalogSearch.ts). */
  const handleSearch = async (queryVal: string) => {
    if (!queryVal.trim() || !user) return;
    setIsSearching(true);
    setSearchResults([]);

    try {
      setSearchResults(await searchCatalog(queryVal));
    } catch (e) {
      console.error("Search error", e);
      toast.error("Could not search the catalogue");
    } finally {
      setIsSearching(false);
    }
  };

  /**
   * Discovery is a button, not a side effect of typing (docs/PRODUCT.md §6).
   * The server calls Gemini and writes the catalog entry; this client never
   * sees the key and never writes `master_registry`.
   */
  const handleDiscover = async () => {
    const queryVal = val.trim();
    if (!queryVal || !user) return;
    setIsDiscovering(true);
    try {
      const result = await userApi.discover(queryVal);
      if (result.alreadyExisted) {
        toast.success("That one is already in the catalogue");
      } else {
        toast.success("Sources found — release notes will arrive as the pipeline runs");
      }
      setSearchResults((prev) => {
        if (prev.some((item) => item.id === result.softwareId)) return prev;
        return [{
          id: result.softwareId,
          name: queryVal,
          type: "software",
          isNew: true,
        }, ...prev];
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Discovery failed";
      toast.error(message);
    } finally {
      setIsDiscovering(false);
    }
  };

  const addToLibrary = async (item: SearchItem) => {
    if (!user) return;
    if (atLimit) {
      toast.error(`The ${tierLabel(tier)} plan lets you follow up to ${limits.maxTrackedItems} items. Remove one or upgrade.`);
      return;
    }

    const type = item.type === "topic" ? "topic" : "software";
    const name = item.name;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
    const interestId = `${user.uid}_topic_${slug || "untitled"}`; // topics only; software ids live in followSoftware

    try {
      if (type === "software") {
        const result = await followSoftware(user.uid, item);
        if (!result.ok) {
          toast.error(`You already follow "${name}"`);
          return;
        }
      } else {
        // Deterministic id: a repeated follow is an idempotent overwrite, not a
        // duplicate notification (docs/DATA_MODEL.md §2).
        const ref = doc(db, "interests", interestId);
        if ((await getDoc(ref)).exists()) {
          toast.error(`You already follow "${name}"`);
          return;
        }

        await setDoc(ref, {
          userId: user.uid,
          softwareId: null,
          topic: name,
          softwareName: name,
          type,
          following: true,
          createdAt: new Date().toISOString(),
        });
      }

      toast.success(`Following ${name}`);
      navigate("/library");
    } catch (e) {
      console.error("Add failed", e);
      toast.error("Failed to add to library");
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Button 
        onClick={() => navigate('/library')} 
        startIcon={<ArrowLeft size={18} />}
        sx={{ mb: 4, color: 'text.secondary' }}
      >
        Back to Library
      </Button>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 900, mb: 1, lineHeight: 1.2 }}>Find software to follow</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          Pick what you want to hear about. We'll tell you when a new version ships.
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Search the catalogue first. If it is missing, one explicit AI discovery finds its changelog.
        </Typography>
        <Box sx={{ mt: 2 }}>
          <Chip
            size="small"
            label={`${tierLabel(tier)} plan • ${trackedCount}${limits.maxTrackedItems === null || isAdmin ? '' : ` / ${limits.maxTrackedItems}`} followed`}
            color={atLimit ? "warning" : "default"}
            variant="outlined"
            sx={{ fontWeight: 700 }}
          />
        </Box>
      </Box>

      {atLimit && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          You have reached the {tierLabel(tier)} limit of {limits.maxTrackedItems} followed items.
          Remove one in your library, or ask an administrator to upgrade the account.
        </Alert>
      )}

      <SoftwareSearch
        value={val}
        onChange={setVal}
        searching={isSearching}
        onSubmitText={handleSearch}
        onFollow={(entry) => addToLibrary({ id: entry.id, name: entry.name, vendor: entry.vendor ?? null, type: "software" })}
      />

      <Grid container spacing={2}>
        {searchResults.map((item) => (
          <Grid size={{ xs: 12 }} key={item.id}>
            <Paper 
              component={motion.div}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              sx={{ p: 2, border: '1px solid rgba(255, 255, 255, 0.05)', bgcolor: 'rgba(255, 255, 255, 0.01)' }}
            >
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Avatar src={item.icon_url || undefined} sx={{ width: 44, height: 44, bgcolor: 'rgba(255,255,255,0.1)' }}>
                  {item.name[0]}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{item.name}</Typography>
                    {item.isNew && <Chip label="New sources" size="small" color="primary" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 800 }} />}
                    {item.website && (
                      <IconButton size="small" href={item.website} target="_blank" rel="noreferrer">
                        <ExternalLink size={14} />
                      </IconButton>
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {item.vendor || item.type || "software"}
                  </Typography>
                </Box>
                <Button 
                  variant="contained"
                  onClick={() => addToLibrary(item)}
                  disabled={atLimit}
                  startIcon={<Plus size={16} />}
                  sx={{ borderRadius: 100 }}
                >
                  Follow
                </Button>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {isSearching && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {val.trim() && !isSearching && searchResults.length === 0 && (
        <Paper sx={{ mt: 3, p: 3, border: '1px dashed rgba(242, 125, 38, 0.35)', bgcolor: 'rgba(242, 125, 38, 0.03)' }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
            <Box sx={{ color: 'primary.main', mt: 0.3 }}><Sparkles size={22} /></Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                Not in the catalogue?
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Ask the server to find sources for “{val.trim()}”. This spends one AI discovery call and
                queues the first poll. No key or scraper runs in your browser.
              </Typography>
              <Button
                variant="outlined"
                onClick={handleDiscover}
                disabled={isDiscovering}
                startIcon={isDiscovering ? <CircularProgress size={16} color="inherit" /> : <Globe size={16} />}
              >
                {isDiscovering ? "Finding sources…" : "Find sources"}
              </Button>
            </Box>
          </Box>
        </Paper>
      )}
    </Container>
  );
}
