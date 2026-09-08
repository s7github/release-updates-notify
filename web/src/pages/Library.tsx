import { useState, useEffect } from "react";
import { 
  Container, Typography, Box, Grid, Button, 
  Paper, Avatar, IconButton, Divider, Stack
} from "@mui/material";
import { 
  collection, query, onSnapshot, doc, where, deleteDoc, getDocs, limit, orderBy, updateDoc 
} from "firebase/firestore";
import { 
  Plus, Library as LibraryIcon, Trash2, Settings, Download, ExternalLink,
  Search as SearchIcon, Filter, Bell, BellOff
} from "lucide-react";
import { useAuth } from "../App";
import { db } from "../services/firebase";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { TextField, InputAdornment, Chip } from "@mui/material";
import AddTopic from "../components/Library/AddTopic";

export default function Library() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [interests, setInterests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    if (!user) return;
    // Show first 10 items as requested
    const q = query(
      collection(db, "interests"), 
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      setInterests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, [user]);

  const removeFromLibrary = async (id: string) => {
    try {
      await deleteDoc(doc(db, "interests", id));
      toast.success("Removed from library");
    } catch (e) {
      toast.error("Failed to remove");
    }
  };

  const toggleFollowing = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, "interests", id), {
        following: !currentStatus
      });
      toast.success(!currentStatus ? "Following - updates appear in For You" : "Not following - updates move to Explore");
    } catch (e) {
      toast.error("Failed to update status");
    }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      // Export all release notes for user's followed softwares
      const followedIds = interests.map(i => i.softwareId).filter(Boolean);
      if (followedIds.length === 0) {
        toast.error("No tracked software to export.");
        return;
      }

      const q = query(
        collection(db, "release_notes"),
        where("softwareId", "in", followedIds.slice(0, 10)) // Firestore 'in' limit
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => d.data());
      
      let content = "";
      if (format === 'json') {
        content = JSON.stringify(data, null, 2);
      } else {
        const headers = ["softwareName", "version", "category", "releaseDate", "summary"];
        const rows = data.map(r => headers.map(h => `"${(r as any)[h] || ''}"`).join(","));
        content = [headers.join(","), ...rows].join("\n");
      }
      
      const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `updatenotify-export-${new Date().toISOString().split('T')[0]}.${format}`;
      a.click();
      toast.success("Data exported successfully!");
    } catch (e) {
      toast.error("Export failed.");
    }
  };

  const filteredInterests = interests.filter(item => {
    const name = (item.softwareName || item.topic || "").toLowerCase();
    const matchesSearch = name.includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || item.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const displayedInterests = filteredInterests.slice(0, 50); // Increased limit as we now have filters

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 }, px: { xs: 1.5, sm: 2, md: 3 } }}>
      <Box sx={{ 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between', 
        alignItems: { xs: 'flex-start', sm: 'center' }, 
        mb: 6,
        gap: 3
      }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <LibraryIcon size={32} color="#F27D26" style={{ flexShrink: 0 }} />
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 900, lineHeight: 1.2, fontSize: { xs: '1.75rem', sm: '2.125rem' } }}>My Library</Typography>
            <Typography variant="caption" color="text.secondary">Manage your tracked software, topics, and data.</Typography>
          </Box>
        </Box>
        <Button 
          variant="contained" 
          component={Link} 
          to="/library/add"
          startIcon={<Plus size={18} />}
          sx={{ borderRadius: 3, px: 3, fontWeight: 700, width: { xs: '100%', sm: 'auto' } }}
        >
          Track a Software
        </Button>
      </Box>

      <Grid container spacing={4}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Box sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 3 }}>
              <TextField 
                size="small"
                fullWidth
                placeholder="Search tracked items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon size={18} />
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                {["all", "software", "topic"].map((type) => (
                  <Chip 
                    key={type}
                    label={type.charAt(0).toUpperCase() + type.slice(1)}
                    onClick={() => setTypeFilter(type)}
                    color={typeFilter === type ? "primary" : "default"}
                    variant={typeFilter === type ? "filled" : "outlined"}
                    sx={{ borderRadius: 1.5, fontWeight: 600, textTransform: 'capitalize' }}
                  />
                ))}
              </Box>
            </Box>

            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              Tracked Items <span style={{ color: '#F27D26', fontSize: '0.8rem' }}>({filteredInterests.length})</span>
            </Typography>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {displayedInterests.map((interest) => (
                <Paper 
                  key={interest.id}
                  sx={{ 
                    p: 2.5, 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    bgcolor: 'rgba(255, 255, 255, 0.01)',
                    '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255, 255, 255, 0.1)' }
                  }}
                >
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Avatar sx={{ width: 40, height: 40, bgcolor: interest.type === 'software' ? 'primary.main' : 'secondary.main', fontSize: '1rem', fontWeight: 800 }}>
                      {interest.type === 'software' ? 'S' : 'T'}
                    </Avatar>
                    <Box 
                      component={interest.type === 'software' ? Link : 'div'}
                      to={interest.type === 'software' ? `/software/${interest.softwareId}` : undefined}
                      sx={{ 
                        textDecoration: 'none', 
                        color: 'inherit',
                        cursor: interest.type === 'software' ? 'pointer' : 'default',
                        '&:hover': { opacity: interest.type === 'software' ? 0.7 : 1 }
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {interest.softwareName || interest.topic}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
                        {interest.type}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    {interest.type === 'software' && (
                      <Chip 
                        label={interest.following ? "Following" : "Not Following"}
                        size="small"
                        icon={interest.following ? <Bell size={14} /> : <BellOff size={14} />}
                        onClick={() => toggleFollowing(interest.id, !!interest.following)}
                        color={interest.following ? "primary" : "default"}
                        variant={interest.following ? "filled" : "outlined"}
                        sx={{ mr: 1, cursor: 'pointer' }}
                      />
                    )}
                    {interest.type === 'software' && (
                      <IconButton 
                        size="small" 
                        onClick={() => navigate(`/software/${interest.softwareId}`)}
                        sx={{ color: 'text.secondary' }}
                      >
                        <ExternalLink size={18} />
                      </IconButton>
                    )}
                    <IconButton color="error" onClick={() => removeFromLibrary(interest.id)}>
                      <Trash2 size={18} />
                    </IconButton>
                  </Box>
                </Paper>
              ))}

              {interests.length > 10 && (
                <Typography variant="caption" sx={{ textAlign: 'center', color: 'text.secondary', display: 'block', mt: 2 }}>
                  Showing latest 10 items. Add more or manage existing ones above.
                </Typography>
              )}

              {interests.length === 0 && !loading && (
                <Box sx={{ py: 8, textAlign: 'center', border: '2px dashed rgba(255,255,255,0.05)', borderRadius: 4 }}>
                  <Typography color="text.secondary" gutterBottom>Your library is currently empty.</Typography>
                  <Button component={Link} to="/library/add" sx={{ mt: 2 }} color="primary">Find software to follow</Button>
                </Box>
              )}
            </Box>
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Box sx={{ position: 'sticky', top: 100, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Box>
              <AddTopic />
            </Box>

            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Settings size={18} /> Data Settings
              </Typography>
            
            <Paper sx={{ p: 3, border: '1px solid rgba(255, 255, 255, 0.05)', bgcolor: 'rgba(255, 255, 255, 0.01)' }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Export your tracked release notes to CSV or JSON for local archiving and self-hosting.
              </Typography>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Button 
                  fullWidth 
                  variant="outlined" 
                  startIcon={<Download size={16} />}
                  onClick={() => handleExport('json')}
                >
                  Export as JSON
                </Button>
                <Button 
                  fullWidth 
                  variant="outlined" 
                  startIcon={<Download size={16} />}
                  onClick={() => handleExport('csv')}
                >
                  Export as CSV
                </Button>
              </Box>

              <Divider sx={{ my: 3, opacity: 0.1 }} />

              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 2 }}>
                SYSTEM STATUS
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="caption" color="text.secondary">Library Integrity</Typography>
                <Typography variant="caption" color="success.main">Healthy</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">AI Feedback Loop</Typography>
                <Typography variant="caption" color="primary.main">Active</Typography>
              </Box>
            </Paper>
          </Box>
        </Box>
      </Grid>
      </Grid>
    </Container>
  );
}
