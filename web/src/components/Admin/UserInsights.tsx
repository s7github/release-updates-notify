import { useState, useEffect } from "react";
import { Box, Typography, Avatar, Divider, Chip, Paper } from "@mui/material";
import { collection, query, onSnapshot } from "firebase/firestore";
import { db } from "../../services/firebase";
import { User, Library, Tag } from "lucide-react";

export default function UserInsights() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Note: In a real app we'd fetch from a users collection
    // Here we derive from interests to see active users and their follows
    const q = query(collection(db, "interests"));
    return onSnapshot(q, async (snap) => {
      const interests = snap.docs.map(d => d.data());
      
      // Group by userId
      const userMap: Record<string, any> = {};
      interests.forEach((item: any) => {
        if (!userMap[item.userId]) {
          userMap[item.userId] = {
            userId: item.userId,
            items: []
          };
        }
        userMap[item.userId].items.push(item);
      });

      setUsers(Object.values(userMap));
      setLoading(false);
    });
  }, []);

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><Typography>Loading insights...</Typography></Box>;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>User Interest Directory</Typography>
      {users.map((u) => (
        <Paper key={u.userId} sx={{ p: 3, bgcolor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
            <Avatar sx={{ bgcolor: 'primary.main' }}><User size={20} /></Avatar>
            <Box>
              <Typography variant="body1" sx={{ fontWeight: 700 }}>User: {u.userId.substring(0, 8)}...</Typography>
              <Typography variant="caption" color="text.secondary">{u.items.length} Interests tracked</Typography>
            </Box>
          </Box>
          <Divider sx={{ mb: 2, opacity: 0.1 }} />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {u.items.map((item: any, idx: number) => (
              <Chip 
                key={idx}
                icon={item.type === 'software' ? <Library size={12} /> : <Tag size={12} />}
                label={item.softwareName || item.topic}
                size="small"
                variant="outlined"
                sx={{ 
                  bgcolor: item.type === 'software' ? 'rgba(242, 125, 38, 0.05)' : 'rgba(255, 255, 255, 0.05)',
                  fontSize: '0.75rem' 
                }}
              />
            ))}
          </Box>
        </Paper>
      ))}
      {users.length === 0 && (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 8 }}>
          No user interaction data available yet.
        </Typography>
      )}
    </Box>
  );
}
