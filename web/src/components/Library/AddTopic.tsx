import { useState } from "react";
import { 
  Box, TextField, Button, Paper, Typography, CircularProgress 
} from "@mui/material";
import { collection, addDoc } from "firebase/firestore";
import { Hash, Plus } from "lucide-react";
import { db } from "../../services/firebase";
import { useAuth } from "../../App";
import toast from "react-hot-toast";

export default function AddTopic() {
  const { user } = useAuth();
  const [topic, setTopic] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleAddTopic = async () => {
    if (!topic.trim() || !user) return;
    
    setIsAdding(true);
    try {
      await addDoc(collection(db, "interests"), {
        userId: user.uid,
        softwareId: null,
        topic: topic.trim(),
        softwareName: topic.trim(),
        type: 'topic',
        following: false,
        createdAt: new Date().toISOString()
      });
      
      setTopic("");
      toast.success(`Broadened your scope with: ${topic}`);
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
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Track a Topic</Typography>
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
          disabled={isAdding || !topic.trim()}
          sx={{ borderRadius: 2, minWidth: 100 }}
        >
          {isAdding ? <CircularProgress size={20} color="inherit" /> : <Plus size={20} />}
        </Button>
      </Box>
    </Paper>
  );
}
