import { useState } from "react";
import { Box, Button, Container, Typography, CircularProgress } from "@mui/material";
import { motion } from "motion/react";
import { Bell, Zap, ShieldCheck, Radio } from "lucide-react";
import toast from "react-hot-toast";
import { signInWithGoogle } from "../services/firebase";
import { showAuthNotice } from "../services/authErrors";

const plans = [
  {
    name: "Free",
    desc: "Follow up to 5 items, a 30-day release history, and push notifications.",
  },
  {
    name: "Pro",
    desc: "Unlimited follows, full release history, deep backfill and CSV/JSON export.",
  },
  {
    name: "Enterprise",
    desc: "Everything in Pro, higher refresh and discovery limits, priority support.",
  },
];

export default function Landing() {
  const [signingIn, setSigningIn] = useState(false);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
      // A redirect fallback returns null here; the page is about to reload.
    } catch (error) {
      showAuthNotice(error, toast);
      setSigningIn(false);
    }
  };

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
              AI-filtered release notes for the software you rely on. Get notified only for what matters:
              new features, security fixes, and the changes that actually affect you.
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
              onClick={handleSignIn}
              disabled={signingIn}
              startIcon={signingIn ? <CircularProgress size={18} color="inherit" /> : undefined}
              sx={{ fontSize: '1.1rem', px: 6, py: 1.5 }}
            >
              {signingIn ? "Signing in…" : "Get Started with Google"}
            </Button>
          </motion.div>

          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3, mt: 6, width: '100%' }}>
            {[
              { icon: <Radio size={24} />, title: "Live feed", desc: "Release notes stream into your dashboard as the pipeline publishes them." },
              { icon: <Zap size={24} />, title: "Source discovery", desc: "AI finds the changelog, RSS feed or GitHub releases page for you." },
              { icon: <Bell size={24} />, title: "Your filters", desc: "Mute bug-fix noise, keep security patches. Major releases always get through." },
              { icon: <ShieldCheck size={24} />, title: "Server-side AI", desc: "Keys and scraping stay off your device. Nothing sensitive ships in the client." },
            ].map((feature, i) => (
              <Box key={i} sx={{
                flex: 1,
                p: 3,
                bgcolor: 'rgba(255, 255, 255, 0.04)',
                borderRadius: 4,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(10px)',
                textAlign: 'left'
              }}>
                <Box sx={{ color: "primary.main", mb: 1.5 }}>{feature.icon}</Box>
                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 700 }}>{feature.title}</Typography>
                <Typography variant="body2" color="text.secondary">{feature.desc}</Typography>
              </Box>
            ))}
          </Box>

          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, width: '100%' }}>
            {plans.map((plan) => (
              <Box key={plan.name} sx={{ flex: 1, p: 2.5, borderRadius: 3, border: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'left' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{plan.name}</Typography>
                <Typography variant="body2" color="text.secondary">{plan.desc}</Typography>
              </Box>
            ))}
          </Box>
          <Typography variant="caption" color="text.disabled">
            Plans are activated by an administrator; there is no self-service checkout in this build.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
