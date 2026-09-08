import { useState } from "react";
import { 
  Container, Typography, Box, TextField, 
  Paper, Avatar, IconButton, CircularProgress, Button, Grid
} from "@mui/material";
import { collection, query, where, getDocs, setDoc, addDoc, doc, limit } from "firebase/firestore";
import { Search as SearchIcon, ArrowLeft, Plus, Globe, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../App";
import { db } from "../services/firebase";
import { discoverSources } from "../services/gemini";
import { pollSoftware, pollSoftwareHistory } from "../services/pollService";
import toast from "react-hot-toast";
import { motion } from "motion/react";

import { createTask } from "../services/taskService";

export default function AddSoftware() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [val, setVal] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const handleSearch = async (queryVal: string) => {
    if (!queryVal || !user) return;
    setIsSearching(true);
    setSearchResults([]);

    try {
      const regQ = query(
        collection(db, "master_registry"), 
        where("active", "==", true),
        limit(20)
      );
      const regSnap = await getDocs(regQ);
      const regResults = regSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(r => r.name.toLowerCase().includes(queryVal.toLowerCase()));
      
      setSearchResults(regResults);

      const result = await discoverSources(queryVal);
      const slug = result.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      
      const discoveredItem = {
        ...result,
        id: slug,
        isNew: true
      };

      setSearchResults(prev => {
        if (prev.some(p => p.id === slug)) return prev;
        return [...prev, discoveredItem];
      });
    } catch (e) {
      console.error("Discovery error", e);
      setSearchResults([{ id: queryVal, name: queryVal, type: 'topic' }]);
    } finally {
      setIsSearching(false);
    }
  };

  const addToLibrary = async (item: any) => {
    if (!user) return;
    const type = item.type === 'topic' ? 'topic' : 'software';
    const idOrTopic = item.id;
    const name = item.name;

    // Fast Add Mode: Start UI feedback immediately
    toast.success(`Tracked ${name}! Processing updates in the background...`);
    
    try {
      if (item.isNew && type === 'software') {
        await setDoc(doc(db, "master_registry", item.id), {
          name: item.name,
          vendor: item.vendor || null,
          website: item.website || null,
          icon_url: item.icon_url || null,
          type: item.type,
          github_url: item.github_url || null,
          rss_url: item.rss_url || null,
          slug: item.id,
          active: true,
          lastCheck: new Date().toISOString()
        });
      }

      await addDoc(collection(db, "interests"), {
        userId: user.uid,
        softwareId: type === 'software' ? idOrTopic : null,
        topic: type === 'topic' ? idOrTopic : null,
        softwareName: name,
        type,
        following: false,
        createdAt: new Date().toISOString()
      });

      if (type === 'software') {
        // Trigger background processing
        const softwareData = {
          id: idOrTopic,
          name: name,
          github_url: item.github_url,
          rss_url: item.rss_url,
          website: item.website
        };

        // Create tasks and fire background jobs
        const pollTaskId = await createTask('initial_poll', idOrTopic, name);
        pollSoftware(softwareData, pollTaskId).catch(console.error);

        const historyTaskId = await createTask('history_scrape', idOrTopic, name);
        pollSoftwareHistory(softwareData, historyTaskId).catch(console.error);
      }
      
      // Immediate Navigation
      navigate('/library');
    } catch (e) {
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

      <Box sx={{ mb: 6 }}>
        <Typography variant="h4" sx={{ fontWeight: 900, mb: 1, lineHeight: 1.2 }}>Discover Software</Typography>
        <Typography variant="caption" color="text.secondary">Search for a tool or library. Items are only added to the centralized registry and your library when you click "Track Updates".</Typography>
      </Box>

      <Paper 
        sx={{ 
          p: 1, 
          display: 'flex', 
          borderRadius: 4, 
          border: '2px solid rgba(242, 125, 38, 0.2)',
          mb: 6
        }}
      >
        <TextField
          fullWidth
          variant="standard"
          placeholder="Search e.g. VS Code, Antigravity, Figma..."
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch(val)}
          sx={{ ml: 2, my: 1 }}
          slotProps={{ input: { disableUnderline: true } }}
        />
        <Button 
          variant="contained" 
          onClick={() => handleSearch(val)}
          disabled={isSearching}
          startIcon={isSearching ? <CircularProgress size={16} color="inherit" /> : <SearchIcon size={18} />}
          sx={{ borderRadius: 3, px: 4 }}
        >
          Search
        </Button>
      </Paper>

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
                <Avatar src={item.icon_url} sx={{ width: 44, height: 44, bgcolor: 'rgba(255,255,255,0.1)' }}>
                  {item.name[0]}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{item.name}</Typography>
                    {item.website && (
                      <IconButton size="small" href={item.website} target="_blank">
                        <ExternalLink size={14} />
                      </IconButton>
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {item.vendor || item.type}
                  </Typography>
                </Box>
                <Button 
                  variant="contained"
                  onClick={() => addToLibrary(item)}
                  startIcon={<Plus size={16} />}
                  sx={{ borderRadius: 100 }}
                >
                  Track Updates
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

      {val && !isSearching && searchResults.length === 0 && (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No results found for "{val}"</Typography>
        </Box>
      )}
    </Container>
  );
}
