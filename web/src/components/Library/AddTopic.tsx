import { useState } from "react";
import { 
  Box, TextField, Button, Paper, Typography, CircularProgress 
} from "@mui/material";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Hash, Plus } from "lucide-react";
import { db } from "../../services/firebase";
import { useAuth } from "../../App";
import { limitsFor } from "../../services/entitlements";
import toast from "react-hot-toast";

export default function AddTopic({ trackedCount }: { trackedCount: number }) {
  const { user, tier, isAdmin } = useAuth();
  const [topic, setTopic] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const limit = isAdmin ? null : limitsFor(tier).maxTrackedItems;
  const atLimit = limit !== null && trackedCount >= limit;

  const handleAddTopic = async () => {
    const trimmed = topic.trim();
    if (!trimmed || !user) return;
    if (atLimit) {
      toast.error(`The ${tier} plan lets you follow up to ${limit} items. Remove one or upgrade to Pro.`);
      return;
    }
    if (trimmed.length > 200) {
      toast.error("Topics are limited to 200 characters");
      return;
    }
    
    setIsAdding(true);
    try {
      const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
      // Deterministic id: following the same topic twice is an idempotent
      // overwrite, not a duplicate notification.
      const ref = doc(db, "interests", `${user.uid}_topic_${slug || 'untitled'}`);
      if ((await getDoc(ref)).exists()) {
        toast.error(`You already follow "${trimmed}"`);
        return;
      }

      await setDoc(ref, {
        userId: user.uid,
        softwareId: null,
        topic: trimmed,
        softwareName: trimmed,
        type: 'topic',
        following: false,
        createdAt: new Date().toISOString()
      });
      
      setTopic("");
      toast.success(`Broadened your scope with: ${trimmed}`);
    } catch (e) {
      console.error("Error adding topic", e);
      toast.error("Failed to add topic");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Paper 
      sx={{ 
        p: 3, 
        border: '1px solid rgba(255, 255, 255, 0.05)', 
        bgcolor: 'rgba(255, 255, 255, 0.01)',
        borderRadius: 4
      }}
    >
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2 }}>
        <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'secondary.main', color: 'white', display: 'flex' }}>
          <Hash size={20} />
        </Box>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Follow a Topic</Typography>
          <Typography variant="caption" color="text.secondary">Follow general industry themes or technologies.</Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="e.g. Serverless, AI Ethics, Rust..."
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddTopic()}
          disabled={isAdding}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              bgcolor: 'rgba(255,255,255,0.02)'
            }
          }}
        />
        <Button 
          variant="contained" 
          color="secondary"
          onClick={handleAddTopic}
          disabled={isAdding || !topic.trim() || atLimit}
          sx={{ borderRadius: 2, minWidth: 100 }}
          title={atLimit ? `Limit reached on ${tier}` : undefined}
        >
          {isAdding ? <CircularProgress size={20} color="inherit" /> : <Plus size={20} />}
        </Button>
      </Box>
    </Paper>
  );
}
