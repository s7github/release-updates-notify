import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  Chip, 
  CircularProgress,
  Paper,
  IconButton,
  Tooltip,
  Link
} from "@mui/material";
import { Brain, TrendingUp, CheckCircle2, AlertCircle, Info, RefreshCw, Database, Zap, ExternalLink } from "lucide-react";
import { getRecentLearnings, LearningType } from "../../services/learningService";
import { formatDistanceToNow } from "date-fns";

const getTypeStyles = (type: LearningType) => {
  switch (type) {
    case "source_correction": return { color: "#00FF7F", icon: <Database size={16} /> };
    case "metadata_improvement": return { color: "#F27D26", icon: <Zap size={16} /> };
    case "pattern_recognition": return { color: "#60A5FA", icon: <Brain size={16} /> };
    case "error_fix": return { color: "#EF4444", icon: <AlertCircle size={16} /> };
    default: return { color: "#94A3B8", icon: <Info size={16} /> };
  }
};

export default function LearningInsights() {
  const navigate = useNavigate();
  const [learnings, setLearnings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLearnings = async () => {
    setLoading(true);
    try {
      const data = await getRecentLearnings(50);
      setLearnings(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLearnings();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchLearnings();
    setRefreshing(false);
  };

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
      <CircularProgress />
    </Box>
  );

  const stats = {
    total: learnings.length,
    corrections: learnings.filter(l => l.type === "source_correction").length,
    applied: learnings.filter(l => l.applied).length
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Brain style={{ color: '#F27D26' }} />
            Self-Learning Insights
          </Typography>
          <Typography variant="body2" color="text.secondary">
            AI-driven data corrections and pattern recognition logs.
          </Typography>
        </Box>
        <IconButton onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw size={20} className={refreshing ? "animate-spin" : ""} />
        </IconButton>
      </Box>

      {/* Stats Cards */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 3, mb: 4 }}>
        {[
          { label: "Learnings Logged", value: stats.total, icon: <Brain />, color: "#F27D26" },
          { label: "Data Corrections", value: stats.corrections, icon: <Database />, color: "#00FF7F" },
          { label: "Auto-Applied", value: stats.applied, icon: <CheckCircle2 />, color: "#60A5FA" }
        ].map((stat, idx) => (
          <Paper 
            key={idx}
            sx={{ 
              flex: 1, 
              p: 3, 
              bgcolor: 'rgba(255,255,255,0.03)', 
              border: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              gap: 2
            }}
          >
            <Box sx={{ 
              p: 1.5, 
              borderRadius: 2, 
              bgcolor: `${stat.color}15`, 
              color: stat.color,
              display: 'flex'
            }}>
              {stat.icon}
            </Box>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>{stat.value}</Typography>
              <Typography variant="caption" color="text.secondary">{stat.label}</Typography>
            </Box>
          </Paper>
        ))}
      </Box>

      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Activity Stream</Typography>
      
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {learnings.map((l) => {
          const style = getTypeStyles(l.type as LearningType);
          return (
            <Card key={l.id} sx={{ bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <CardContent sx={{ p: '20px !important' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1.5, alignItems: "center" }}>
                    <Chip 
                      icon={style.icon}
                      label={l.type.replace('_', ' ').toUpperCase()} 
                      size="small" 
                      sx={{ 
                        bgcolor: `${style.color}15`, 
                        color: style.color, 
                        fontWeight: 700,
                        fontSize: 10,
                        border: `1px solid ${style.color}30`
                      }} 
                    />
                    {l.applied && (
                      <Chip 
                        icon={<CheckCircle2 size={12} />} 
                        label="APPLIED" 
                        size="small" 
                        variant="outlined"
                        color="success"
                        sx={{ fontSize: 10, height: 22 }} 
                      />
                    )}
                  </Box>
                  <Typography variant="caption" color="text.disabled">
                    {formatDistanceToNow(new Date(l.createdAt), { addSuffix: true })}
                  </Typography>
                </Box>

                <Box 
                  onClick={() => l.softwareId && navigate(`/software/${l.softwareId}`)}
                  sx={{ 
                    cursor: l.softwareId ? 'pointer' : 'default',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 1,
                    mb: 0.5,
                    '&:hover': l.softwareId ? { color: '#F27D26' } : {}
                  }}
                >
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    {l.softwareName || "System-wide"}
                  </Typography>
                  {l.softwareId && <ExternalLink size={14} style={{ opacity: 0.5 }} />}
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {l.description}
                </Typography>

                <Box sx={{ bgcolor: 'rgba(0,0,0,0.2)', p: 1.5, borderRadius: 1, mb: 2 }}>
                   <Typography variant="caption" sx={{ color: style.color, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                     <TrendingUp size={12} /> IMPACT
                   </Typography>
                   <Typography variant="body2">{l.impact}</Typography>
                </Box>

                {l.newValue && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.disabled">Suggested Change:</Typography>
                    <Paper 
                      variant="outlined" 
                      sx={{ 
                        p: 1, 
                        mt: 0.5, 
                        bgcolor: 'rgba(0,0,0,0.3)', 
                        fontFamily: 'monospace',
                        fontSize: 11,
                        overflowX: 'auto'
                      }}
                    >
                      {l.newValue}
                    </Paper>
                  </Box>
                )}
              </CardContent>
            </Card>
          );
        })}
        {learnings.length === 0 && (
          <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'transparent', border: '2px dashed rgba(255,255,255,0.05)' }}>
            <Typography color="text.disabled">No learning logs available yet. Initiate discovery to train the system.</Typography>
          </Paper>
        )}
      </Box>
    </Box>
  );
}
