import { useState, useEffect } from "react";
import { 
  Box, Typography, Paper, Grid, Chip, LinearProgress, 
  IconButton, Tooltip, Badge
} from "@mui/material";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { db } from "../../services/firebase";
import { 
  CheckCircle2, XCircle, Clock, Loader2, 
  Workflow, Database, RefreshCw, AlertCircle
} from "lucide-react";

export default function ProcessingInsights() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "background_tasks"),
      orderBy("updatedAt", "desc"),
      limit(50)
    );

    return onSnapshot(q, (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 size={16} color="#4caf50" />;
      case 'failed': return <XCircle size={16} color="#f44336" />;
      case 'processing': return <Loader2 size={16} className="animate-spin" color="#2196f3" />;
      default: return <Clock size={16} color="#9e9e9e" />;
    }
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case 'initial_poll': return <RefreshCw size={18} />;
      case 'history_scrape': return <Database size={18} />;
      case 'metadata_enrichment': return <Workflow size={18} />;
      default: return <RefreshCw size={18} />;
    }
  };

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><Loader2 className="animate-spin" /></Box>;

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Background Pipeline</Typography>
        <Chip 
          label={`${tasks.filter(t => t.status === 'processing').length} active tasks`} 
          size="small" 
          color="primary" 
          variant="outlined" 
        />
      </Box>

      <Grid container spacing={2}>
        {tasks.map((task) => (
          <Grid size={{ xs: 12 }} key={task.id}>
            <Paper sx={{ p: 2, border: '1px solid rgba(255, 255, 255, 0.05)', bgcolor: 'rgba(255, 255, 255, 0.01)' }}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                <Box sx={{ 
                  p: 1, 
                  borderRadius: 2, 
                  bgcolor: 'rgba(255,255,255,0.05)',
                  color: task.status === 'failed' ? 'error.main' : 'text.primary'
                }}>
                  {getTaskIcon(task.type)}
                </Box>
                
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {task.softwareName}
                      </Typography>
                      <Chip 
                        label={task.type.replace('_', ' ').toUpperCase()} 
                        size="small" 
                        sx={{ fontSize: '0.6rem', height: 16, opacity: 0.7 }} 
                      />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                       {getStatusIcon(task.status)}
                       <Typography variant="caption" sx={{ textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 800 }}>
                         {task.status}
                       </Typography>
                    </Box>
                  </Box>

                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    {task.message}
                  </Typography>

                  {task.status === 'processing' && (
                    <LinearProgress 
                      variant="determinate" 
                      value={task.progress} 
                      sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)' }} 
                    />
                  )}

                  {task.status === 'failed' && task.error && (
                    <Box sx={{ 
                      mt: 1, 
                      p: 1, 
                      borderRadius: 1, 
                      bgcolor: 'rgba(244, 67, 54, 0.05)', 
                      display: 'flex', 
                      gap: 1, 
                      alignItems: 'center' 
                    }}>
                      <AlertCircle size={12} color="#f44336" />
                      <Typography variant="caption" color="error" sx={{ fontSize: '0.7rem' }}>
                        {task.error}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            </Paper>
          </Grid>
        ))}

        {tasks.length === 0 && (
          <Box sx={{ p: 4, textAlign: 'center', width: '100%', opacity: 0.5 }}>
            <Typography variant="body2">No active or recent background tasks.</Typography>
          </Box>
        )}
      </Grid>
    </Box>
  );
}
