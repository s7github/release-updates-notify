import { createContext, useContext, useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider, CssBaseline, Box, CircularProgress } from "@mui/material";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Toaster } from "react-hot-toast";

import { auth, db } from "./services/firebase";
import { theme } from "./theme";

// Components
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Landing from "./pages/Landing";
import SoftwareDetails from "./pages/SoftwareDetails";
import Library from "./pages/Library";
import AddSoftware from "./pages/AddSoftware";
import Processing from "./pages/Processing";
import Navbar from "./components/layout/Navbar";

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, isAdmin: false, loading: true });

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Sync user to Firestore
        const userDoc = doc(db, "users", user.uid);
        const snap = await getDoc(userDoc);
        if (!snap.exists()) {
          await setDoc(userDoc, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            createdAt: new Date().toISOString(),
            settings: {
              notifyFeatures: true,
              notifySecurity: true,
              notifyFixes: true,
              notifyOptimizations: true,
            }
          });
        }

        // Check Admin
        const adminDoc = doc(db, "admins", user.uid);
        const adminSnap = await getDoc(adminDoc);
        
        // Seed first user as admin (for development convenience)
        if (user.email === "saurabh257@gmail.com") {
          if (!adminSnap.exists()) {
            await setDoc(adminDoc, { email: user.email, seededAt: new Date().toISOString() });
          }
          setIsAdmin(true);
        } else {
          setIsAdmin(adminSnap.exists());
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
  }, []);

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
      <AuthContext.Provider value={{ user, isAdmin, loading }}>
          <Router>
            <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
              {user && <Navbar />}
              <Box component="main" sx={{ flexGrow: 1 }}>
                <Routes>
                  <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Landing />} />
                  <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/" />} />
                  <Route path="/admin" element={isAdmin ? <Admin /> : <Navigate to="/dashboard" />} />
                  <Route path="/admin/processing" element={isAdmin ? <Processing /> : <Navigate to="/dashboard" />} />
                  <Route path="/library" element={user ? <Library /> : <Navigate to="/" />} />
                  <Route path="/library/add" element={user ? <AddSoftware /> : <Navigate to="/" />} />
                  <Route path="/software/:id" element={user ? <SoftwareDetails /> : <Navigate to="/" />} />
                </Routes>
              </Box>
            </Box>
          </Router>
          <Toaster position="top-right" />
        </AuthContext.Provider>
      </ThemeProvider>
  );
}
