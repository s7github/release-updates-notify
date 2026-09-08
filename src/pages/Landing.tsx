import { Box, Button, Container, Typography } from "@mui/material";
import { motion } from "motion/react";
import { Bell, Zap, Search, ShieldCheck } from "lucide-react";
import { signInWithGoogle } from "../services/firebase";

export default function Landing() {
  return (
    <Box sx={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center',
      background: 'radial-gradient(circle at 50% 30%, #3a1510 0%, transparent 60%), #050505'
    }}>
      <Container maxWidth="md">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: "center", textAlign: "center" }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <Typography variant="overline" color="primary" sx={{ letterSpacing: 4, fontWeight: 700 }}>
              SMART RELEASE DISCOVERY
            </Typography>
            <Typography variant="h1" sx={{ fontSize: { xs: '3rem', md: '5rem' }, mt: 2, lineHeight: 1 }}>
              Silence the Noise.<br />Highlight the <span style={{ color: '#F27D26' }}>Changes.</span>
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ mt: 3, maxWidth: 600, mx: 'auto' }}>
              Gemini AI-powered filters for software updates. Get notified only for what matters to you: New Features, Security Fixes, or Optimizations.
            </Typography>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <Button 
              variant="contained" 
              size="large" 
              onClick={signInWithGoogle}
              sx={{ fontSize: '1.1rem', px: 6, py: 1.5 }}
            >
              Get Started with Google
            </Button>
          </motion.div>

          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 4, mt: 8, width: '100%' }}>
            {[
              { icon: <Zap size={24} />, title: "Magic Discovery", desc: "AI automatically finds changelogs, RSS feeds, and GitHub releases." },
              { icon: <Bell size={24} />, title: "Smart Filters", desc: "Only get notified for the categories you care about." },
              { icon: <ShieldCheck size={24} />, title: "Security First", desc: "Prioritizes critical vulnerability updates and security optimizations." }
            ].map((feature, i) => (
              <Box key={i} sx={{ 
                flex: 1, 
                p: 3, 
                bgcolor: 'rgba(255, 255, 255, 0.05)', 
                borderRadius: 4,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)'
              }}>
                <Box sx={{ color: "primary.main", mb: 2 }}>{feature.icon}</Box>
                <Typography variant="h6" gutterBottom>{feature.title}</Typography>
                <Typography variant="body2" color="text.secondary">{feature.desc}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
