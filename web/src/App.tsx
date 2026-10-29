import { createContext, lazy, Suspense, useContext, useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider, CssBaseline, Box, CircularProgress } from "@mui/material";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";

import { auth, db, completeRedirectSignIn } from "./services/firebase";
import { showAuthNotice } from "./services/authErrors";
import { effectiveTier, type SubscriptionTier } from "./services/entitlements";
import { theme } from "./theme";

// Components
import Landing from "./pages/Landing";
import Navbar from "./components/layout/Navbar";

// Dense routes are split out: the login page should not download the admin
// data grid or the drag-and-drop registry editor before it can render.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Admin = lazy(() => import("./pages/Admin"));
const SoftwareDetails = lazy(() => import("./pages/SoftwareDetails"));
const Library = lazy(() => import("./pages/Library"));
const AddSoftware = lazy(() => import("./pages/AddSoftware"));
const Processing = lazy(() => import("./pages/Processing"));

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  tier: SubscriptionTier;
  tierExpiresAt: string | null;
  loading: boolean;
}

export type { SubscriptionTier } from "./services/entitlements";

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  tier: "FREE",
  tierExpiresAt: null,
  loading: true,
});

const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('The pseudo class ":first-child" is potentially unsafe when doing server-side rendering')) {
    return;
  }
  originalWarn(...args);
};

const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('The pseudo class ":first-child" is potentially unsafe when doing server-side rendering')) {
    return;
  }
  originalError(...args);
};

export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tier, setTier] = useState<SubscriptionTier>("FREE");
  const [tierExpiresAt, setTierExpiresAt] = useState<string | null>(null);
  const [rawTier, setRawTier] = useState<string>("FREE");
  const [loading, setLoading] = useState(true);

  // A redirect sign-in can land here before the auth listener runs. Completing
  // it explicitly means the button works even when the popup was blocked.
  useEffect(() => {
    completeRedirectSignIn().catch((error) => {
      showAuthNotice(error, toast);
    });
  }, []);

  useEffect(() => {
    let stopUser: (() => void) | undefined;
    let stopAdmin: (() => void) | undefined;
    let failsafe: ReturnType<typeof setTimeout> | undefined;

    const stopAuth = onAuthStateChanged(auth, (nextUser) => {
      stopUser?.();
      stopAdmin?.();
      stopUser = undefined;
      stopAdmin = undefined;
      clearTimeout(failsafe);

      setUser(nextUser);
      if (!nextUser) {
        setIsAdmin(false);
        setTier("FREE");
        setTierExpiresAt(null);
        setRawTier("FREE");
        setLoading(false);
        return;
      }

      // A missing profile is created once. Every field here is on the rules'
      // create allow-list; `subscriptionTier` may only start FREE.
      const userRef = doc(db, "users", nextUser.uid);
      getDoc(userRef)
        .then(async (snap) => {
          if (snap.exists() || !nextUser.email) return;
          await setDoc(userRef, {
            uid: nextUser.uid,
            email: nextUser.email,
            displayName: nextUser.displayName ?? null,
            photoURL: nextUser.photoURL ?? null,
            createdAt: new Date().toISOString(),
            subscriptionTier: "FREE",
            settings: {
              notifyFeatures: true,
              notifySecurity: true,
              notifyFixes: true,
              notifyOptimizations: true,
            },
          });
        })
        .catch((error) => {
          // Offline is not fatal: the rest of the app still reads from cache.
          console.warn("Could not create the user profile", error);
        });

      // Live tier. Admin changes take effect without a reload.
      stopUser = onSnapshot(
        userRef,
        (snap) => {
          const data = snap.data();
          const storedTier = data?.subscriptionTier;
          const expiresAt = data?.subscriptionExpiresAt ?? null;
          setRawTier(typeof storedTier === "string" ? storedTier : "FREE");
          setTierExpiresAt(typeof expiresAt === "string" ? expiresAt : null);
          setTier(effectiveTier(storedTier, expiresAt));
        },
        () => {
          setTier("FREE");
          setTierExpiresAt(null);
        },
      );

      // Admin membership is a document, checked live so a revocation applies
      // immediately. There is deliberately no email-based bootstrap here.
      stopAdmin = onSnapshot(
        doc(db, "admins", nextUser.uid),
        (snap) => {
          setIsAdmin(snap.exists());
          setLoading(false);
          clearTimeout(failsafe);
        },
        () => {
          setIsAdmin(false);
          setLoading(false);
          clearTimeout(failsafe);
        },
      );

      // Firestore can take a while on a cold, offline start. Do not trap the
      // whole app behind a spinner.
      failsafe = setTimeout(() => setLoading(false), 4_000);
    });

    return () => {
      clearTimeout(failsafe);
      stopUser?.();
      stopAdmin?.();
      stopAuth();
    };
  }, []);

  // An expiry can pass while the tab is open. Re-evaluate once a minute so a
  // lapsed Pro account falls back to Free without a refresh.
  useEffect(() => {
    if (!tierExpiresAt) return;
    const timer = setInterval(() => {
      setTier(effectiveTier(rawTier, tierExpiresAt));
    }, 60_000);
    return () => clearInterval(timer);
  }, [rawTier, tierExpiresAt]);

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#050505' }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthContext.Provider value={{ user, isAdmin, tier, tierExpiresAt, loading }}>
          <Router>
            <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
              {user && <Navbar />}
              <Box component="main" sx={{ flexGrow: 1 }}>
                <Suspense fallback={
                  <Box sx={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CircularProgress size={28} />
                  </Box>
                }>
                  <Routes>
                    <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Landing />} />
                    <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/" />} />
                    <Route path="/admin" element={isAdmin ? <Admin /> : <Navigate to="/dashboard" />} />
                    <Route path="/admin/processing" element={isAdmin ? <Processing /> : <Navigate to="/dashboard" />} />
                    <Route path="/library" element={user ? <Library /> : <Navigate to="/" />} />
                    <Route path="/library/add" element={user ? <AddSoftware /> : <Navigate to="/" />} />
                    <Route path="/software/:id" element={user ? <SoftwareDetails /> : <Navigate to="/" />} />
                  </Routes>
                </Suspense>
              </Box>
            </Box>
          </Router>
          <Toaster position="top-right" />
        </AuthContext.Provider>
      </ThemeProvider>
  );
}
