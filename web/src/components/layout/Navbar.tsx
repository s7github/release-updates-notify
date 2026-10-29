import { AppBar, Toolbar, Typography, Button, Container, Avatar, IconButton, Badge, Box, Tooltip, Chip } from "@mui/material";
import { LogOut, LayoutDashboard, Shield, Library, Activity } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { auth, db } from "../../services/firebase";
import { useAuth } from "../../App";
import { tierLabel } from "../../services/entitlements";
import { useState, useEffect } from "react";
import { BRAND } from "../../brand";
import { collection, query, where, onSnapshot } from "firebase/firestore";

export default function Navbar() {
  const { user, isAdmin, tier } = useAuth();
  const location = useLocation();
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(
      collection(db, "background_tasks"),
      where("status", "==", "processing")
    );
    return onSnapshot(q, (snap) => {
      setActiveCount(snap.size);
    }, () => setActiveCount(0));
  }, [isAdmin]);

  const handleLogout = () => auth.signOut();

  return (
    <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'rgba(5, 5, 5, 0.8)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', zIndex: 1100 }}>
      <Container maxWidth="lg">
        <Toolbar sx={{ px: { xs: 0 } }}>
          <Typography variant="h6" component={Link} to="/" sx={{ flexGrow: 1, textDecoration: 'none', color: 'inherit', fontWeight: 800, letterSpacing: -1, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
            <span aria-label={BRAND.name}>
              <span style={{ fontWeight: 400 }}>{BRAND.wordmark.light}</span>
              <span style={{ fontWeight: 800 }}>{BRAND.wordmark.bold}</span>
            </span>
          </Typography>

          <Box sx={{ display: 'flex', gap: { xs: 0.2, sm: 1 }, alignItems: "center" }}>
            <Tooltip title={`Subscription: ${tierLabel(tier)}`}>
              <Chip
                label={tier}
                size="small"
                color={tier === 'FREE' ? 'default' : 'primary'}
                variant={tier === 'FREE' ? 'outlined' : 'filled'}
                sx={{ fontWeight: 800, fontSize: '0.65rem', height: 22, display: { xs: 'none', sm: 'inline-flex' } }}
              />
            </Tooltip>
            <Button 
              component={Link} 
              to="/dashboard" 
              color={location.pathname === '/dashboard' ? 'primary' : 'inherit'}
              sx={{ minWidth: { xs: '40px', sm: 'auto' }, px: { xs: 1, sm: 2 } }}
            >
              <LayoutDashboard size={18} />
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, ml: 1 }}>Feed</Box>
            </Button>

            <Button 
              component={Link} 
              to="/library" 
              color={location.pathname === '/library' ? 'primary' : 'inherit'}
              sx={{ minWidth: { xs: '40px', sm: 'auto' }, px: { xs: 1, sm: 2 } }}
            >
              <Library size={18} />
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, ml: 1 }}>Library</Box>
            </Button>

            {isAdmin && (
              <>
                <Tooltip title={`${activeCount} active tasks`}>
                  <Button 
                    component={Link} 
                    to="/admin/processing" 
                    color={location.pathname === '/admin/processing' ? 'primary' : 'inherit'}
                    sx={{ minWidth: { xs: '40px', sm: 'auto' }, px: { xs: 1, sm: 2 }, position: 'relative' }}
                  >
                    <Badge badgeContent={activeCount} color="error" sx={{ '& .MuiBadge-badge': { fontWeight: 900, top: -5, right: -5 } }}>
                      <Activity size={18} className={activeCount > 0 ? "animate-pulse" : ""} />
                    </Badge>
                    <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, ml: 1 }}>Processing</Box>
                  </Button>
                </Tooltip>

                <Button 
                  component={Link} 
                  to="/admin" 
                  color={location.pathname === '/admin' ? 'primary' : 'inherit'}
                  sx={{ minWidth: { xs: '40px', sm: 'auto' }, px: { xs: 1, sm: 2 } }}
                >
                  <Shield size={18} />
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, ml: 1 }}>Admin</Box>
                </Button>
              </>
            )}

            <IconButton onClick={handleLogout} sx={{ ml: { xs: 0.5, sm: 1 } }}>
              <LogOut size={20} />
            </IconButton>
            
            <Avatar 
              src={user?.photoURL || ''} 
              sx={{ width: 32, height: 32, ml: 1, border: '1px solid rgba(255, 255, 255, 0.2)' }} 
            />
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
}
