import { useState, useEffect } from "react";
import { Card, CardContent, Typography, Box, Chip, IconButton, Button, Collapse, Avatar } from "@mui/material";
import { Bell, BellOff, ChevronDown, ChevronUp, ExternalLink, Shield, Zap, Bug, Settings2, History as HistoryIcon, ArrowRight, Sparkles, PlusCircle, Wrench } from "lucide-react";
import { format } from "date-fns";
import { Link, useNavigate } from "react-router-dom";
import Markdown from "react-markdown";
import { useAuth } from "../../App";
import { db } from "../../services/firebase";
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, getDoc } from "firebase/firestore";
import toast from "react-hot-toast";

const categoryIcons: Record<string, any> = {
  "New Features": <PlusCircle size={14} />,
  "Feature Updates": <Zap size={14} />,
  "Optimization/Tips": <Wrench size={14} />,
  "Bug Fixes": <Bug size={14} />,
  "Security Patches": <Shield size={14} />,
  "Major Milestone Update": <Sparkles size={14} />
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case "Security Patches": return { bg: 'rgba(255, 69, 58, 0.1)', text: '#FF453A' };
    case "Major Milestone Update": return { bg: 'rgba(255, 215, 0, 0.15)', text: '#FFD700' };
    case "New Features": return { bg: 'rgba(0, 255, 127, 0.1)', text: '#00FF7F' };
    default: return { bg: 'rgba(242, 125, 38, 0.1)', text: '#F27D26' };
  }
};

export default function ReleaseCard({ 
  release, 
  isFollowed, 
  onToggleFollow 
}: { 
  release: any;
  isFollowed?: boolean;
  onToggleFollow?: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [softwareInfo, setSoftwareInfo] = useState<any>(null);

  // Fetch logo/info from master registry
  useEffect(() => {
    const fetchInfo = async () => {
      if (!release.softwareId) return;
      const docRef = doc(db, "master_registry", release.softwareId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setSoftwareInfo(snap.data());
      }
    };
    fetchInfo();
  }, [release.softwareId]);

  return (
    <Card sx={{ 
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', 
      '&:hover': { 
        transform: 'translateY(-4px)',
        boxShadow: '0 12px 24px rgba(0,0,0,0.3)',
        borderColor: 'primary.main'
      },
      bgcolor: 'background.paper',
      border: '1px solid rgba(255, 255, 255, 0.05)',
      borderRadius: 3,
      position: 'relative'
    }}>
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: "center" }}>
            <Avatar 
              src={softwareInfo?.icon_url}
              sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
            >
              {release.softwareName?.[0]}
            </Avatar>
            <Box sx={{ cursor: 'pointer' }} onClick={() => navigate(`/software/${release.softwareId}`)}>
              <Typography variant="body1" sx={{ fontWeight: 800, lineHeight: 1.2, '&:hover': { color: 'primary.main' } }}>{release.softwareName}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {release.version || format(new Date(release.releaseDate), "MMM d, yyyy")}
              </Typography>
            </Box>
          </Box>
          {onToggleFollow && (
            <IconButton 
              onClick={(e) => {
                e.stopPropagation();
                onToggleFollow();
              }} 
              color={isFollowed ? "primary" : "default"}
              size="small"
              sx={{ bgcolor: 'rgba(255, 255, 255, 0.03)' }}
            >
              {isFollowed ? <Bell size={18} /> : <BellOff size={18} />}
            </IconButton>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'center' }}>
          <Chip 
            icon={categoryIcons[release.category] || <Zap size={14} />} 
            label={release.category} 
            size="small" 
            sx={{ 
              fontWeight: 700, 
              fontSize: '0.65rem', 
              height: 22,
              bgcolor: getCategoryColor(release.category).bg,
              color: getCategoryColor(release.category).text,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              '& .MuiChip-icon': { color: 'inherit' }
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ py: 0.2 }}>
            {format(new Date(release.releaseDate), "PPP")}
          </Typography>
        </Box>

        <Box sx={{ 
          maxHeight: expanded ? 'none' : 72, 
          overflow: 'hidden', 
          position: 'relative',
          transition: 'max-height 0.3s ease-out',
          '& .markdown-body p': { mb: 1, fontSize: '0.875rem', color: 'text.secondary', lineHeight: 1.5 },
          '& .markdown-body ul': { pl: 2, color: 'text.secondary', fontSize: '0.875rem', mb: 1 }
        }}>
          <div className="markdown-body">
            <Markdown>{release.summary}</Markdown>
          </div>
          {!expanded && (
            <Box sx={{ 
              position: 'absolute', 
              bottom: 0, 
              left: 0, 
              right: 0, 
              height: 32, 
              background: 'linear-gradient(transparent, #1a1a1a)' 
            }} />
          )}
        </Box>

        <Box sx={{ 
          mt: 2, 
          pt: 1.5, 
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex',
          gap: 1
        }}>
          <Button 
            size="small" 
            variant="contained" 
            endIcon={<ArrowRight size={14} />}
            component={Link}
            to={`/software/${release.softwareId}`}
            sx={{ 
              ml: 'auto !important', 
              borderRadius: 2, 
              fontWeight: 700, 
              fontSize: '0.75rem', 
              bgcolor: 'rgba(255, 255, 255, 0.05)', 
              color: 'text.primary',
              '&:hover': { bgcolor: 'primary.main', color: 'white' }
            }}
          >
            More Details
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
