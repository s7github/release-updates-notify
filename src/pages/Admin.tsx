import { useState, useEffect } from "react";
import { Container, Typography, Box, Divider, CircularProgress, Tabs, Tab } from "@mui/material";
import { collection, query, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebase";
import RegistryManager from "../components/Admin/RegistryManager";
import UserInsights from "../components/Admin/UserInsights";
import LearningInsights from "../components/Admin/LearningInsights";
import ProcessingInsights from "../components/Admin/ProcessingInsights";

export default function Admin() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    setLoading(false);
  }, []);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.2 }}>Admin Panel</Typography>
        <Typography variant="caption" color="text.secondary">Automated platform control and user interest directory.</Typography>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'rgba(255, 255, 255, 0.1)', mb: 3 }}>
        <Tabs 
          value={tab} 
          onChange={(_, v) => setTab(v)} 
          textColor="primary" 
          indicatorColor="primary"
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
        >
          <Tab label="Master Registry" sx={{ fontWeight: 700 }} />
          <Tab label="User Insights" sx={{ fontWeight: 700 }} />
          <Tab label="Self-Learning" sx={{ fontWeight: 700 }} />
          <Tab label="Processing Insights" sx={{ fontWeight: 700 }} />
        </Tabs>
      </Box>

      {tab === 0 && <RegistryManager />}
      {tab === 1 && <UserInsights />}
      {tab === 2 && <LearningInsights />}
      {tab === 3 && <ProcessingInsights />}
    </Container>
  );
}

