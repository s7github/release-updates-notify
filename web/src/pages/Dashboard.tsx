import { useState, useEffect, useMemo, useRef } from "react";
import { 
  Container, Typography, Tabs, Tab, Box, Grid, Button, TextField, 
  InputAdornment, Chip, CircularProgress, Paper, Divider, 
  Select, MenuItem, FormControl, InputLabel, Pagination 
} from "@mui/material";
import { collection, query, orderBy, onSnapshot, getDocs, where, limit, updateDoc, doc } from "firebase/firestore";
import { Filter, Calendar, ChevronRight, ChevronLeft } from "lucide-react";
import { useAuth } from "../App";
import { db } from "../services/firebase";
import ReleaseCard from "../components/Dashboard/ReleaseCard";

import { Link } from "react-router-dom";
import toast from "react-hot-toast";

const ITEMS_PER_PAGE = 10;

export default function Dashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState(0); // 0: For You, 1: Explore All
  const [releases, setReleases] = useState<any[]>([]);
  const [interests, setInterests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
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

  // Fetch Releases based on interests
  useEffect(() => {
    if (!user || interests.length === 0) {
      if (interests.length === 0 && !loading) {
        setReleases([]);
      }
      return;
    }

    setLoading(true);
    // Standard query: last 3 months by default (this is handled in memory filtering to account for varied ranges)
    const q = query(
      collection(db, "release_notes"),
      orderBy("releaseDate", "desc"),
      limit(200) // Fetch a reasonable chunk for client-side filtering and pagination
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allReleases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      // Deduplicate: Latest 1 card per app
      const uniqueReleasesMap = new Map();
      allReleases.forEach(r => {
        if (!uniqueReleasesMap.has(r.softwareId)) {
          uniqueReleasesMap.set(r.softwareId, r);
        } else {
          const existing = uniqueReleasesMap.get(r.softwareId);
          if (new Date(r.releaseDate) > new Date(existing.releaseDate)) {
            uniqueReleasesMap.set(r.softwareId, r);
          }
        }
      });
      
      setReleases(Array.from(uniqueReleasesMap.values()));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, interests.length]);

  const filteredReleases = useMemo(() => {
    const softwareInterests = interests.filter(i => i.type === 'software');
    const followedIds = softwareInterests.filter(i => i.following === true).map(i => i.softwareId);
    // Everything in the library that is NOT explicitly following=true is in Explore All
    const notFollowedIds = softwareInterests.filter(i => i.following !== true).map(i => i.softwareId);
    
    let base = releases;
    if (tab === 0) {
      base = releases.filter(r => followedIds.includes(r.softwareId));
    } else {
      base = releases.filter(r => notFollowedIds.includes(r.softwareId));
    }

    // 2. Date Filter
    const sDate = new Date(startDate);
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
  }, [releases, tab, interests, startDate, endDate, timelineCategory, selectedTopic]);

  const paginatedReleases = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredReleases.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredReleases, page]);

  const topics = interests.filter(i => i.type === 'topic').map(i => i.topic);

  const toggleInterestFollow = async (softwareId: string) => {
    const interest = interests.find(i => i.softwareId === softwareId);
    if (!interest) return;
    
    try {
      await updateDoc(doc(db, "interests", interest.id), {
        following: !interest.following
      });
      toast.success(!interest.following ? "Following product" : "Stopped following");
    } catch (e) {
      toast.error("Failed to update status");
    }
  };

  if (!user) return null;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.2 }}>Release Updates</Typography>
          <Typography variant="caption" color="text.secondary">
            Feed status: Active • Tracking <b>{interests.length}</b> products
          </Typography>
        </Box>
      </Box>

      {interests.length === 0 && !loading ? (
        <Paper sx={{ textAlign: "center", py: 12, bgcolor: "rgba(255, 255, 255, 0.02)", borderRadius: 4, border: '1px dashed rgba(255, 255, 255, 0.1)' }}>
          <Typography variant="h5" color="text.secondary" gutterBottom sx={{ fontWeight: 700 }}>Your feed is empty</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            You haven't tracked any software or topics yet.
          </Typography>
          <Button component={Link} to="/library" variant="contained" size="large" sx={{ borderRadius: 100, px: 4 }}>
            Go to Library
          </Button>
        </Paper>
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
          <Tab label="Primary" sx={{ fontWeight: 700 }} />
          <Tab label="All" sx={{ fontWeight: 700 }} />
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
            {paginatedReleases.length === 0 && (
              <Grid size={{ xs: 12 }}>
                <Box sx={{ textAlign: "center", py: 12, bgcolor: "rgba(255, 255, 255, 0.02)", borderRadius: 4, border: '1px dashed rgba(255, 255, 255, 0.1)' }}>
                  <Typography variant="h6" color="text.secondary" gutterBottom>No Updates Found</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Try Broadening your filters or following more products in your library.
                  </Typography>
                </Box>
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


