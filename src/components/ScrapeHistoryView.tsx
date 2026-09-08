import { useState, useEffect } from "react";
import { 
  Box, Typography, Paper, TextField, Button, 
  CircularProgress, Divider, List, ListItem, 
  ListItemText, Chip, LinearProgress, Stack,
  Alert, AlertTitle, Grid, Avatar
} from "@mui/material";
import { 
  History, Play, CheckCircle, 
  Search, Database, Bot, ArrowRight,
  RefreshCw, Globe, Server, Tag, Zap
} from "lucide-react";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebase";
import { pollSoftwareHistory } from "../services/pollService";
import { createTask, BackgroundTask } from "../services/taskService";
import { motion, AnimatePresence } from "motion/react";
import toast from "react-hot-toast";

interface ScrapeHistoryViewProps {
  software: any;
  onClose: () => void;
}

export default function ScrapeHistoryView({ software, onClose }: ScrapeHistoryViewProps) {
  const [maxCount, setMaxCount] = useState<number>(software.historyMaxCount || 50);
  const [minDate, setMinDate] = useState<string>(software.historyMinDate || "");
  const [activeTask, setActiveTask] = useState<BackgroundTask | null>(null);
  const [lastTask, setLastTask] = useState<BackgroundTask | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Listen for active or recent tasks for this software
  useEffect(() => {
    const q = query(
      collection(db, "background_tasks"),
      where("softwareId", "==", software.id),
      where("type", "==", "history_scrape"),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const task = { id: snap.docs[0].id, ...snap.docs[0].data() } as BackgroundTask;
        if (task.status === 'processing' || task.status === 'pending') {
          setActiveTask(task);
        } else {
          setActiveTask(null);
          setLastTask(task);
        }
      }
    });
  }, [software.id]);

  const handleStartScrape = async () => {
    setIsStarting(true);
    const toastId = toast.loading("Initializing global history scrape...");
    try {
      // 1. Create Task
      const taskId = await createTask('history_scrape', software.id, software.name);
      
      // 2. Trigger Scrape (Don't await, it runs in background)
      // We pass the updated software object with limits
      const updatedSoftware = {
        ...software,
        historyMaxCount: maxCount,
        historyMinDate: minDate
      };
      
      pollSoftwareHistory(updatedSoftware, taskId).catch(err => {
         console.error("Background scrape failed:", err);
      });
      
      toast.success("Scrape started in background", { id: toastId });
    } catch (err: any) {
      toast.error("Failed to start scrape: " + err.message, { id: toastId });
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <Box sx={{ p: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
          <History size={24} />
        </Avatar>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900 }}>Global History Scraper</Typography>
          <Typography variant="body2" color="text.secondary">Retrieve past maintenance and version records for {software.name}</Typography>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Settings Panel */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper sx={{ p: 3, border: '1px solid rgba(255,255,255,0.1)', bgcolor: 'rgba(255,255,255,0.02)' }}>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Zap size={16} color="#FFD700" />
              Scrape Configuration
            </Typography>
            
            <Stack spacing={3}>
              <TextField 
                label="Maximum Versions to Fetch"
                type="number"
                fullWidth
                size="small"
                value={maxCount}
                onChange={(e) => setMaxCount(parseInt(e.target.value) || 0)}
                helperText="How deep in time should we go?"
              />
              <TextField 
                label="Earliest Release Date"
                type="date"
                fullWidth
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                value={minDate}
                onChange={(e) => setMinDate(e.target.value)}
                helperText="Only fetch releases after this date"
              />

              <Box sx={{ pt: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  This will perform a deep traversal of GitHub APIs, RSS feeds, and use Gemini AI to reconstruct the product's timeline.
                </Typography>

                <Button 
                  variant="contained" 
                  fullWidth 
                  disabled={!!activeTask || isStarting}
                  startIcon={activeTask ? <CircularProgress size={20} color="inherit" /> : <Play size={18} />}
                  onClick={handleStartScrape}
                  sx={{ py: 1.5, fontWeight: 900, borderRadius: 2 }}
                >
                  {activeTask ? 'Scrape in Progress...' : 'Launch Scraper'}
                </Button>
              </Box>
            </Stack>
          </Paper>

          {lastTask && !activeTask && (
            <Alert icon={<CheckCircle size={20} />} severity={lastTask.status === 'completed' ? 'success' : 'error'} sx={{ mt: 2 }}>
              <AlertTitle>{lastTask.status === 'completed' ? 'Last Scrape Successful' : 'Last Scrape Failed'}</AlertTitle>
              {lastTask.message} {lastTask.status === 'completed' && <Typography variant="caption" sx={{ display: 'block' }}>Found {lastTask.details?.foundCount || 0} releases</Typography>}
            </Alert>
          )}
        </Grid>

        {/* Progress Panel */}
        <Grid size={{ xs: 12, md: 7 }}>
          <AnimatePresence mode="wait">
            {activeTask ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <Paper sx={{ p: 3, height: '100%', border: '1px solid rgba(255,255,255,0.1)', bgcolor: 'rgba(0,0,0,0.2)' }}>
                  <Box sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>Dynamic Scrape Progress</Typography>
                      <Chip 
                        label={activeTask.progress + "%"} 
                        size="small" 
                        color="primary" 
                        sx={{ fontWeight: 900 }} 
                      />
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={activeTask.progress} 
                      sx={{ height: 8, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.05)' }} 
                    />
                    <Typography variant="body2" sx={{ mt: 1, color: 'primary.main', fontWeight: 600 }}>
                      <RefreshCw size={14} className="animate-spin" style={{ marginRight: 8, verticalAlign: 'middle' }} />
                      {activeTask.message}
                    </Typography>
                  </Box>

                  <Divider sx={{ mb: 2, opacity: 0.1 }} />

                  <Stack spacing={2}>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                       <Paper sx={{ flex: 1, p: 2, bgcolor: 'rgba(255,255,255,0.02)' }}>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                            <Globe size={12} /> TARGET SOURCE
                          </Typography>
                          <Typography variant="body2" noWrap sx={{ fontWeight: 700, maxWidth: 200 }}>
                            {activeTask.details?.sourceUrl || 'Analyzing...'}
                          </Typography>
                       </Paper>
                       <Paper sx={{ flex: 1, p: 2, bgcolor: 'rgba(255,255,255,0.02)' }}>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                            <Database size={12} /> RECORD MATCHES
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {activeTask.details?.completedCount || 0} / {activeTask.details?.foundCount || '?'}
                          </Typography>
                       </Paper>
                    </Box>

                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                        <Bot size={14} /> LIVE SAMPLES IDENTIFIED
                      </Typography>
                      {activeTask.details?.samples && activeTask.details.samples.length > 0 ? (
                        <List disablePadding>
                          {activeTask.details.samples.map((sample: any, idx: number) => (
                            <ListItem key={idx} sx={{ px: 0 }}>
                              <ListItemText 
                                primary={
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Tag size={12} color="#F27D26" />
                                    <Typography variant="caption" sx={{ fontWeight: 700 }}>v{sample.version}</Typography>
                                    <ArrowRight size={10} />
                                    <Typography variant="caption" color="text.secondary">{sample.releaseDate}</Typography>
                                  </Box>
                                }
                                secondary={
                                  <Typography variant="caption" noWrap sx={{ display: 'block', opacity: 0.6 }}>
                                    {sample.summary || sample.rawData?.substring(0, 50)}...
                                  </Typography>
                                }
                              />
                            </ListItem>
                          ))}
                        </List>
                      ) : (
                        <Box sx={{ p: 4, textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 2 }}>
                          <Typography variant="caption" color="text.secondary">No samples extracted yet...</Typography>
                        </Box>
                      )}
                    </Box>

                    <Box>
                       <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                         <Server size={14} /> RECENT LOGS
                       </Typography>
                       <Box sx={{ bgcolor: 'black', p: 1.5, borderRadius: 1.5, fontFamily: 'monospace', fontSize: '0.65rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <Typography sx={{ color: 'primary.main', fontSize: 'inherit' }}>[SYSTEM] Task started at {activeTask.createdAt?.toDate?.()?.toLocaleTimeString() || 'N/A'}</Typography>
                          <Typography sx={{ color: 'text.secondary', fontSize: 'inherit' }}>[POLLER] Mode: Deep Scrape</Typography>
                          <Typography sx={{ color: 'text.secondary', fontSize: 'inherit' }}>[POLLER] Action: {activeTask.details?.currentAction || 'Searching...'}</Typography>
                          <Typography sx={{ color: 'success.main', fontSize: 'inherit' }}>[POLLER] {activeTask.message}</Typography>
                       </Box>
                    </Box>
                  </Stack>
                </Paper>
              </motion.div>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.5, textAlign: 'center', p: 6 }}>
                <Box sx={{ width: 80, height: 80, borderRadius: '50%', border: '2px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
                  <Search size={32} />
                </Box>
                <Typography variant="h6">No Active Scrape</Typography>
                <Typography variant="body2">Adjust your settings and click "Launch Scraper" to begin deep traversal of historical data.</Typography>
              </Box>
            )}
          </AnimatePresence>
        </Grid>
      </Grid>
    </Box>
  );
}
