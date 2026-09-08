import { useState, useEffect } from "react";
import { 
  Box, Typography, Container, Paper, Grid, 
  LinearProgress, Chip, IconButton, Button,
  Avatar, Divider, Stack, List, ListItem, ListItemText,
  Badge, Tooltip, Alert, Breadcrumbs, Link
} from "@mui/material";
import { 
  RefreshCw, CheckCircle, AlertCircle, Clock, 
  Trash2, Play, ExternalLink, ArrowRight,
  Database, Bot, Globe, Server, Tag, Info,
  Search, Shield, ChevronRight, LayoutDashboard, History,
  Activity
} from "lucide-react";
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, limit } from "firebase/firestore";
import { db } from "../services/firebase";
import { BackgroundTask } from "../services/taskService";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

export default function Processing() {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Listen to the last 20 tasks
    const q = query(
      collection(db, "background_tasks"),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    return onSnapshot(q, (snap) => {
      const taskList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as BackgroundTask));
      setTasks(taskList);
      setLoading(false);
    });
  }, []);

  const handleDeleteTask = async (id: string) => {
    try {
      await deleteDoc(doc(db, "background_tasks", id));
      toast.success("Task log cleared");
    } catch (err) {
      toast.error("Failed to delete task");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'failed': return 'error';
      case 'processing': return 'primary';
      default: return 'default';
    }
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case 'history_scrape': return <History size={20} />;
      case 'poll_software': return <RefreshCw size={20} />;
      case 'auto_discovery': return <Search size={20} />;
      default: return <Server size={20} />;
    }
  };

  // Aggregated Stats
  const activeCount = tasks.filter(t => t.status === 'processing').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const failedCount = tasks.filter(t => t.status === 'failed').length;

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Breadcrumbs sx={{ mb: 1, color: 'text.secondary' }}>
          <Link 
            component="button" 
            variant="caption" 
            onClick={() => navigate('/dashboard')}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'inherit', textDecoration: 'none' }}
          >
            <LayoutDashboard size={12} /> Dashboard
          </Link>
          <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main' }}>
            <Activity size={12} /> Live Processing
          </Typography>
        </Breadcrumbs>
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 900, mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
              Active Background Tasks
              <Badge badgeContent={activeCount} color="primary" sx={{ '& .MuiBadge-badge': { fontWeight: 900 } }}>
                <Box sx={{ p: 1 }} />
              </Badge>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Real-time monitoring of all discovery, scraping, and verification processes.
            </Typography>
          </Box>
          
          <Stack direction="row" spacing={2}>
            <Paper sx={{ p: 1.5, px: 3, border: '1px solid rgba(255,255,255,0.1)', bgcolor: 'rgba(255,255,255,0.02)', textAlign: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 900, color: 'success.main' }}>{completedCount}</Typography>
              <Typography variant="caption" sx={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: 1 }}>Succeeded</Typography>
            </Paper>
            <Paper sx={{ p: 1.5, px: 3, border: '1px solid rgba(255,255,255,0.1)', bgcolor: 'rgba(255,255,255,0.02)', textAlign: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 900, color: 'error.main' }}>{failedCount}</Typography>
              <Typography variant="caption" sx={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: 1 }}>Failed</Typography>
            </Paper>
          </Stack>
        </Box>
      </Box>

      {tasks.length === 0 && !loading ? (
        <Paper sx={{ p: 10, textAlign: 'center', border: '2px dashed rgba(255,255,255,0.1)', bgcolor: 'transparent' }}>
          <Server size={48} color="rgba(255,255,255,0.2)" />
          <Typography variant="h6" sx={{ mt: 2, color: 'text.secondary' }}>No background tasks found</Typography>
          <Typography variant="body2" color="text.disabled">Tasks appear here when you initiate scraping or updates.</Typography>
        </Paper>
      ) : (
      <Box sx={{ mt: 2 }}>
        <Stack spacing={3}>
          <AnimatePresence>
            {tasks.map((task) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                layout
              >
                <Paper 
                  sx={{ 
                    p: 3, 
                    border: '1px solid',
                    borderColor: task.status === 'processing' ? 'primary.main' : 'rgba(255,255,255,0.1)',
                    bgcolor: task.status === 'processing' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.02)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {task.status === 'processing' && (
                    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2 }}>
                      <LinearProgress variant="indeterminate" sx={{ height: 2, opacity: 0.5 }} />
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {/* Section 1: Task Identity */}
                    <Box sx={{ flex: '1 1 300px' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                        <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                          {getTaskIcon(task.type)}
                        </Avatar>
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography 
                              variant="h6" 
                              sx={{ fontWeight: 900, cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                              onClick={() => navigate(`/software/${task.softwareId}`)}
                            >
                              {task.softwareName}
                            </Typography>
                            <Tooltip title="View Project Details">
                              <IconButton size="small" onClick={() => navigate(`/software/${task.softwareId}`)}>
                                <ExternalLink size={14} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Chip 
                              label={task.type === 'history_scrape' ? 'DEEP HISTORY' : 'REGULAR SYNC'} 
                              size="small" 
                              variant="outlined"
                              sx={{ fontSize: '0.6rem', fontWeight: 900, height: 20 }}
                            />
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Clock size={12} /> {task.createdAt?.toDate?.()?.toLocaleString() || (task.createdAt ? new Date(task.createdAt).toLocaleString() : 'N/A')}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                      
                      <Box sx={{ mt: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="caption" sx={{ fontWeight: 800, color: 'primary.main' }}>
                            {task.message}
                          </Typography>
                          <Typography variant="caption" sx={{ fontWeight: 900 }}>{task.progress}%</Typography>
                        </Box>
                        <LinearProgress 
                          variant="determinate" 
                          value={task.progress} 
                          color={getStatusColor(task.status) as any}
                          sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.05)' }} 
                        />
                      </Box>
                    </Box>

                    {/* Section 2: Scrape Details & Priority */}
                    <Box sx={{ flex: '1 1 300px', p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, textTransform: 'uppercase', letterSpacing: 1 }}>
                        <Shield size={14} /> Pipeline Config
                      </Typography>
                      
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
                        <Box>
                           <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Active Action</Typography>
                           <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.light' }}>
                             {task.details?.currentAction?.replace('_', ' ').toUpperCase() || 'IDLE'}
                           </Typography>
                        </Box>
                        <Box>
                           <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Priority Chain</Typography>
                           <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                             {task.details?.activePriority?.slice(0, 5).map((p: string) => (
                               <Chip key={p} label={p} size="small" sx={{ height: 16, fontSize: '0.55rem', fontWeight: 900 }} />
                             ))}
                           </Box>
                        </Box>
                        {task.details?.settings && (
                          <Box sx={{ gridColumn: 'span 2' }}>
                            <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                              <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Max Count</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{task.details.settings.maxCount || 'Unlimited'}</Typography>
                              </Box>
                              <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Start Date</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{task.details.settings.minDate || 'Earliest'}</Typography>
                              </Box>
                            </Box>
                          </Box>
                        )}
                        <Box sx={{ gridColumn: 'span 2' }}>
                           <Divider sx={{ my: 1, opacity: 0.1 }} />
                           <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                             <Box>
                               <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Matches Found</Typography>
                               <Typography variant="h6" sx={{ fontWeight: 900 }}>{task.details?.foundCount || 0}</Typography>
                             </Box>
                             <ArrowRight size={20} color="rgba(255,255,255,0.1)" />
                             <Box>
                               <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Saved to DB</Typography>
                               <Typography variant="h6" sx={{ fontWeight: 900, color: 'success.main' }}>{task.details?.completedCount || 0}</Typography>
                             </Box>
                           </Box>
                        </Box>
                      </Box>
                    </Box>

                      {/* Section 3: Samples & Logs */}
                      <Box sx={{ flex: '2 1 400px' }}>
                        <Box sx={{ display: 'flex', gap: 2, height: '100%' }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                              <Search size={14} /> Extraction Samples
                            </Typography>
                            {task.details?.samples && task.details.samples.length > 0 ? (
                               <List dense disablePadding>
                                 {task.details.samples.map((s: any, i: number) => (
                                   <ListItem key={i} dense sx={{ p: 0.5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 1, mb: 0.5 }}>
                                      <ListItemText 
                                        primary={<Typography sx={{ fontSize: '0.7rem', fontWeight: 900 }}>v{s.version}</Typography>}
                                        secondary={<Typography sx={{ fontSize: '0.65rem', opacity: 0.6 }} noWrap>{s.summary || s.rawData?.substring(0, 50)}</Typography>}
                                      />
                                   </ListItem>
                                 ))}
                               </List>
                            ) : (
                              <Box sx={{ height: '80%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 2 }}>
                                <Typography variant="caption" color="text.disabled">Waiting for extraction...</Typography>
                              </Box>
                            )}
                          </Box>

                          <Box sx={{ flex: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                               <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                 <Server size={14} /> Server Log
                               </Typography>
                               <IconButton size="small" onClick={() => handleDeleteTask(task.id)}>
                                 <Trash2 size={12} />
                               </IconButton>
                            </Box>
                            <Box sx={{ bgcolor: 'black', p: 1.5, borderRadius: 1.5, fontFamily: 'monospace', fontSize: '0.65rem', height: 120, overflow: 'auto', border: '1px solid rgba(255,255,255,0.05)' }}>
                               {task.error && (
                                 <Typography sx={{ color: 'error.main', fontSize: 'inherit', mb: 1 }}>[ERROR] {task.error}</Typography>
                               )}
                               <Typography sx={{ color: 'success.main', fontSize: 'inherit' }}>[SYSTEM] Task identified as {task.id.substring(0, 8)}</Typography>
                               <Typography sx={{ color: 'text.secondary', fontSize: 'inherit' }}>[NETWORK] Source: {task.details?.sourceUrl || 'TBD'}</Typography>
                               <Typography sx={{ color: 'primary.main', fontSize: 'inherit' }}>[AI] Extraction depth: {task.details?.foundCount || 0} items</Typography>
                               <Typography sx={{ color: 'text.secondary', fontSize: 'inherit' }}>[STATUS] {task.message}</Typography>
                            </Box>
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                  </Paper>
                </motion.div>
            ))}
          </AnimatePresence>
        </Stack>
      </Box>
    )}
    </Container>
  );
}
