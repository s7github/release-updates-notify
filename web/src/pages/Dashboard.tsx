import { useState, useEffect, useMemo, useRef } from "react";
import { 
  Container, Typography, Tabs, Tab, Box, Grid, TextField,
  InputAdornment, Chip, CircularProgress, Paper, Divider, 
  Select, MenuItem, FormControl, InputLabel, Pagination 
} from "@mui/material";
import { collection, query, orderBy, onSnapshot, where, limit, updateDoc, doc } from "firebase/firestore";
import { Calendar, ChevronRight, ChevronLeft } from "lucide-react";
import { useAuth } from "../App";
import { db } from "../services/firebase";
import { historyStart, tierLabel } from "../services/entitlements";
import ReleaseCard from "../components/Dashboard/ReleaseCard";
import EmptyFeed from "../components/Dashboard/EmptyFeed";
import FirstRun from "../components/Onboarding/FirstRun";
import { countFeedInputs, feedState } from "../services/feedState";

import toast from "react-hot-toast";

const ITEMS_PER_PAGE = 10;

export default function Dashboard() {
  const { user, tier } = useAuth();
  const [tab, setTab] = useState(0); // 0: Following, 1: Muted
  const [releases, setReleases] = useState<any[]>([]);
  const [interests, setInterests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [interestsLoaded, setInterestsLoaded] = useState(false);
  const [liveState, setLiveState] = useState<"idle" | "live" | "cache">("idle");
  const [liveAt, setLiveAt] = useState<Date | null>(null);
  
  // Date Filtering State
  const [dateRangeType, setDateRangeType] = useState("3m");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const startInputRef = useRef<HTMLInputElement>(null);

  // Topics/Category Filtering
  const [selectedTopic, setSelectedTopic] = useState("All");
  const [timelineCategory, setTimelineCategory] = useState("All");

  // Pagination
  const [page, setPage] = useState(1);

  // Real-time listener for user interests
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "interests"), where("userId", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snap) => {
      setInterests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setInterestsLoaded(true);
    }, () => {
      setInterests([]);
      setInterestsLoaded(true);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  // Initial Date Range setup
  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setMonth(end.getMonth() - 3);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  }, []);

  const handleDateTypeChange = (type: string) => {
    setDateRangeType(type);
    if (type === 'custom') {
      setTimeout(() => startInputRef.current?.focus(), 10);
      return;
    }

    const end = new Date();
    const start = new Date();
    if (type === '7d') start.setDate(end.getDate() - 7);
    else if (type === '1m') start.setMonth(end.getMonth() - 1);
    else if (type === '3m') start.setMonth(end.getMonth() - 3);
    else if (type === '6m') start.setMonth(end.getMonth() - 6);
    else if (type === '1y') start.setFullYear(end.getFullYear() - 1);

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  // A live feed, scoped to this user's library.
  //
  // The old query listened to the 200 newest release notes in the whole
  // database and filtered them in memory — so a busy catalog could push a
  // user's own releases out of the window and make the feed look empty. This
  // subscribes per `softwareId` chunk instead (Firestore caps `in` at 30),
  // which keeps the listener both real-time and correct.
  const librarySoftwareKey = useMemo(
    () => Array.from(new Set(
      interests
        .filter((interest) => typeof interest.softwareId === "string" && interest.softwareId.length > 0)
        .map((interest) => interest.softwareId as string),
    )).sort().join("|"),
    [interests],
  );

  useEffect(() => {
    if (!user) return;
    const softwareIds = librarySoftwareKey ? librarySoftwareKey.split("|") : [];

    if (softwareIds.length === 0) {
      setReleases([]);
      setLoading(false);
      setLiveState("idle");
      return;
    }

    setLoading(true);
    const chunks: string[][] = [];
    for (let i = 0; i < softwareIds.length; i += 30) chunks.push(softwareIds.slice(i, i + 30));

    const perChunk = new Map<number, any[]>();
    const cachedChunks = new Set<number>();

    const publish = () => {
      const merged = new Map<string, any>();
      perChunk.forEach((rows) => rows.forEach((row) => merged.set(row.id, row)));
      const next = Array.from(merged.values()).sort((a, b) => {
        const aTime = new Date(a.releaseDate || a.createdAt || 0).getTime();
        const bTime = new Date(b.releaseDate || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
      setReleases(next);
      setLoading(false);
      setLiveAt(new Date());
      setLiveState(cachedChunks.size > 0 ? "cache" : "live");
    };

    const unsubscribes = chunks.map((ids, index) => onSnapshot(
      query(
        collection(db, "release_notes"),
        where("softwareId", "in", ids),
        orderBy("releaseDate", "desc"),
        limit(50),
      ),
      (snapshot) => {
        perChunk.set(index, snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
        if (snapshot.metadata.fromCache) cachedChunks.add(index);
        else cachedChunks.delete(index);
        publish();
      },
      () => {
        // One failed chunk must not blank the whole feed.
        cachedChunks.add(index);
        publish();
      },
    ));

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [user, librarySoftwareKey]);

  const filteredReleases = useMemo(() => {
    const softwareInterests = interests.filter(i => i.type === 'software');
    const followedIds = softwareInterests.filter(i => i.following === true).map(i => i.softwareId);
    // Everything in the library that is NOT following=true is under Muted
    const notFollowedIds = softwareInterests.filter(i => i.following !== true).map(i => i.softwareId);
    
    let base = releases;
    if (tab === 0) {
      base = releases.filter(r => followedIds.includes(r.softwareId));
    } else {
      base = releases.filter(r => notFollowedIds.includes(r.softwareId));
    }

    // One card per product: the dashboard is "what changed lately", not a
    // second copy of the release timeline.
    const latestPerSoftware = new Map<string, any>();
    base.forEach((release) => {
      const existing = latestPerSoftware.get(release.softwareId);
      const releaseTime = new Date(release.releaseDate || release.createdAt || 0).getTime();
      const existingTime = existing ? new Date(existing.releaseDate || existing.createdAt || 0).getTime() : -Infinity;
      if (!existing || releaseTime > existingTime) latestPerSoftware.set(release.softwareId, release);
    });
    base = Array.from(latestPerSoftware.values());

    // Free accounts see a 30-day window; paid accounts see everything. The
    // custom date picker cannot widen a plan's window.
    const tierStart = historyStart(tier);
    const requestedStart = new Date(startDate);
    const sDate = tierStart && requestedStart < tierStart ? tierStart : requestedStart;
    const eDate = new Date(endDate);
    eDate.setHours(23, 59, 59, 999);

    return base.filter(r => {
      const rDate = new Date(r.releaseDate);
      const matchesDate = rDate >= sDate && rDate <= eDate;
      const matchesCategory = timelineCategory === "All" || r.category === timelineCategory;
      const matchesTopic = selectedTopic === "All" || 
                           r.softwareName?.toLowerCase().includes(selectedTopic.toLowerCase()) || 
                           r.summary?.toLowerCase().includes(selectedTopic.toLowerCase());
      
      return matchesDate && matchesCategory && matchesTopic;
    });
  }, [releases, tab, interests, startDate, endDate, timelineCategory, selectedTopic, tier]);

  const paginatedReleases = useMemo(() => {
    const safePage = Math.min(page, Math.max(1, Math.ceil(filteredReleases.length / ITEMS_PER_PAGE)));
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filteredReleases.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredReleases, page]);

  // Any filter change goes back to page 1; clamp so a shrinking result set
  // never leaves the user on an empty page.
  useEffect(() => { setPage(1); }, [startDate, endDate, dateRangeType, tab, timelineCategory, selectedTopic]);
  const pageCount = Math.max(1, Math.ceil(filteredReleases.length / ITEMS_PER_PAGE));
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const topics = interests.filter(i => i.type === 'topic').map(i => i.topic);

  const softwareInterests = interests.filter((i) => i.type === "software");
  const followedCount = softwareInterests.filter((i) => i.following === true).length;
  const state = feedState({
    ...countFeedInputs(interests, releases),
    visibleCount: filteredReleases.length,
  });
  const showFirstRun = interestsLoaded && softwareInterests.length === 0;
  const canWiden = timelineCategory !== "All" || selectedTopic !== "All" || (tier !== "FREE" && dateRangeType !== "1y");

  const followAll = async () => {
    const targets = softwareInterests.filter((i) => i.following !== true);
    if (targets.length === 0) return;
    const results = await Promise.allSettled(
      targets.map((i) => updateDoc(doc(db, "interests", i.id), { following: true })),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) toast.success("Following everything in your library");
    else toast.error(`Couldn't update ${failed} of ${targets.length} items. Please try again.`);
  };

  const showWiderRange = () => {
    setTimelineCategory("All");
    setSelectedTopic("All");
    handleDateTypeChange("1y");
    setPage(1);
  };

  const toggleInterestFollow = async (softwareId: string) => {
    const interest = interests.find(i => i.softwareId === softwareId);
    if (!interest) return;
    
    try {
      await updateDoc(doc(db, "interests", interest.id), {
        following: !interest.following
      });
      toast.success(!interest.following ? "Following – you'll get its updates" : "Muted – saved in your library, no notifications");
    } catch (e) {
      toast.error("Failed to update status");
    }
  };

  if (!user) return null;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {!showFirstRun && interestsLoaded && (
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 800, lineHeight: 1.2 }}>Release Updates</Typography>
            <Chip
              size="small"
              label={liveState === 'live' ? 'LIVE' : liveState === 'cache' ? 'CACHED' : 'IDLE'}
              color={liveState === 'live' ? 'success' : liveState === 'cache' ? 'warning' : 'default'}
              variant={liveState === 'live' ? 'filled' : 'outlined'}
              sx={{ fontWeight: 900, fontSize: '0.6rem', letterSpacing: 1 }}
            />
          </Box>
          <Typography variant="caption" color="text.secondary">
            Following <b>{followedCount}</b> of <b>{softwareInterests.length}</b> saved • Plan: <b>{tierLabel(tier)}</b>
            {tier === 'FREE' ? ' • Last 30 days' : ' • Full history'}
            {liveAt ? ` • Updated ${liveAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          </Typography>
        </Box>
      </Box>
      )}

      {!interestsLoaded ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><CircularProgress /></Box>
      ) : showFirstRun ? (
        <FirstRun />
      ) : (
        <>
          <Paper sx={{ mb: 4, p: 3, border: '1px solid rgba(255, 255, 255, 0.05)', bgcolor: 'rgba(255, 255, 255, 0.01)' }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 4 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Date Range</InputLabel>
              <Select
                value={dateRangeType}
                label="Date Range"
                onChange={(e) => handleDateTypeChange(e.target.value)}
              >
                <MenuItem value="7d">Last 7 Days</MenuItem>
                <MenuItem value="1m">Last 1 Month</MenuItem>
                <MenuItem value="3m">Last 3 Months</MenuItem>
                <MenuItem value="6m">Last 6 Months</MenuItem>
                <MenuItem value="1y">Last 1 Year</MenuItem>
                <MenuItem value="custom">Custom Range</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              type="date"
              size="small"
              label="Start Date"
              inputRef={startInputRef}
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (dateRangeType !== 'custom') setDateRangeType('custom');
              }}
              disabled={dateRangeType !== 'custom'}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              type="date"
              size="small"
              label="End Date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                if (dateRangeType !== 'custom') setDateRangeType('custom');
              }}
              disabled={dateRangeType !== 'custom'}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
        </Grid>
      </Paper>

      <Box sx={{ borderBottom: 1, borderColor: 'rgba(255, 255, 255, 0.1)', mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => { setTab(v); setPage(1); }} textColor="primary" indicatorColor="primary">
          <Tab label="Following" sx={{ fontWeight: 700 }} />
          <Tab label="Muted" sx={{ fontWeight: 700 }} />
        </Tabs>
      </Box>

      {/* Logic Filter Pill Rows */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', mr: 1 }}>FILTER CATEGORY:</Typography>
          {["All", "New Features", "Bug Fixes", "Security"].map((cat) => (
            <Chip 
              key={cat} 
              label={cat} 
              size="small"
              onClick={() => { setTimelineCategory(cat); setPage(1); }}
              variant={timelineCategory === cat ? "filled" : "outlined"}
              color={timelineCategory === cat ? "primary" : "default"}
              sx={{ borderRadius: 1.5, fontWeight: 600 }}
            />
          ))}
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', mr: 1 }}>TOPICS INTERESTS:</Typography>
          <Chip 
            label="All Topics" 
            size="small"
            onClick={() => { setSelectedTopic("All"); setPage(1); }}
            variant={selectedTopic === "All" ? "filled" : "outlined"}
            color={selectedTopic === "All" ? "secondary" : "default"}
            sx={{ borderRadius: 1.5, fontWeight: 600 }}
          />
          {topics.map((t) => (
            <Chip 
              key={t} 
              label={t} 
              size="small"
              onClick={() => { setSelectedTopic(t); setPage(1); }}
              variant={selectedTopic === t ? "filled" : "outlined"}
              color={selectedTopic === t ? "secondary" : "default"}
              sx={{ borderRadius: 1.5, fontWeight: 600 }}
            />
          ))}
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><CircularProgress /></Box>
      ) : (
        <>
          <Grid container spacing={3}>
            {paginatedReleases.map((release) => (
              <Grid size={{ xs: 12, md: 6 }} key={release.id}>
                <ReleaseCard 
                  release={release} 
                  isFollowed={interests.find(i => i.softwareId === release.softwareId)?.following === true}
                  onToggleFollow={() => toggleInterestFollow(release.softwareId)}
                />
              </Grid>
            ))}
            {paginatedReleases.length === 0 && state !== "has-releases" && (
              <Grid size={{ xs: 12 }}>
                <EmptyFeed
                  state={state}
                  tab={tab === 0 ? "following" : "muted"}
                  libraryCount={softwareInterests.length}
                  mutedCount={softwareInterests.filter((i) => i.following !== true).length}
                  onFollowAll={followAll}
                  onShowWiderRange={showWiderRange}
                  canWiden={canWiden}
                  isFree={tier === "FREE"}
                />
              </Grid>
            )}
          </Grid>

          {filteredReleases.length > ITEMS_PER_PAGE && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
              <Pagination 
                count={Math.ceil(filteredReleases.length / ITEMS_PER_PAGE)} 
                page={page} 
                onChange={(_, v) => { setPage(v); window.scrollTo({ top: 0, behavior: 'smooth' }); }} 
                color="primary"
                sx={{ '& .MuiPaginationItem-root': { fontWeight: 700 } }}
              />
            </Box>
          )}
        </>
      )}
    </>
  )}
</Container>
  );
}


