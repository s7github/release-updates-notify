import { useEffect, useMemo, useState } from "react";
import {
  Box, Typography, Avatar, Chip, Paper, TextField, Select, MenuItem,
  FormControl, InputLabel, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Tooltip, CircularProgress, Alert, Divider,
} from "@mui/material";
import { collection, query, onSnapshot, limit } from "firebase/firestore";
import { User, Library, Search, Shield, ShieldOff, Pencil, Users } from "lucide-react";
import { db } from "../../services/firebase";
import { useAuth } from "../../App";
import { adminApi, ApiError } from "../../services/api";
import {
  effectiveTier, normalizeTier, tierLabel, type SubscriptionTier,
} from "../../services/entitlements";
import toast from "react-hot-toast";

interface UserRow {
  uid: string;
  email?: string;
  displayName?: string | null;
  subscriptionTier?: string;
  subscriptionExpiresAt?: string | null;
  createdAt?: string;
}

export default function UserInsights() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [trackedByUser, setTrackedByUser] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [savingUid, setSavingUid] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [planTier, setPlanTier] = useState<SubscriptionTier>("FREE");
  const [expiry, setExpiry] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "users"), limit(500)),
      (snap) => {
        const rows = snap.docs
          .map((doc) => ({ uid: doc.id, ...doc.data() } as UserRow))
          .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
        setUsers(rows);
        setLoading(false);
        setReadError(null);
      },
      () => {
        setLoading(false);
        setReadError("The users collection could not be read. Check that your account is in admins/{uid}.");
      },
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return onSnapshot(
      collection(db, "admins"),
      (snap) => setAdminIds(new Set(snap.docs.map((doc) => doc.id))),
      () => setAdminIds(new Set()),
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "interests"), limit(2000)),
      (snap) => {
        const counts: Record<string, number> = {};
        snap.docs.forEach((doc) => {
          const uid = String(doc.get("userId") ?? "");
          if (uid) counts[uid] = (counts[uid] ?? 0) + 1;
        });
        setTrackedByUser(counts);
      },
      () => setTrackedByUser({}),
    );
  }, []);

  const filtered = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((row) =>
      `${row.email ?? ""} ${row.displayName ?? ""} ${row.uid}`.toLowerCase().includes(needle),
    );
  }, [users, searchTerm]);

  const stats = useMemo(() => {
    const paid = users.filter((row) => effectiveTier(row.subscriptionTier, row.subscriptionExpiresAt) !== "FREE").length;
    return {
      total: users.length,
      paid,
      admins: adminIds.size,
      tracked: Object.values(trackedByUser).reduce((sum: number, count) => sum + Number(count), 0),
    };
  }, [users, adminIds, trackedByUser]);

  const openPlan = (row: UserRow) => {
    setEditing(row);
    setPlanTier(effectiveTier(row.subscriptionTier, row.subscriptionExpiresAt));
    setExpiry(row.subscriptionExpiresAt ? String(row.subscriptionExpiresAt).slice(0, 10) : "");
  };

  const savePlan = async () => {
    if (!editing) return;
    setSavingUid(editing.uid);
    try {
      const expiresAt = planTier === "FREE" || !expiry
        ? null
        : new Date(`${expiry}T23:59:59.000Z`).toISOString();
      await adminApi.updateUserTier(editing.uid, planTier, expiresAt);
      toast.success(`${editing.email || editing.uid} is now ${tierLabel(planTier)}`);
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not update the plan");
    } finally {
      setSavingUid(null);
    }
  };

  const toggleAdmin = async (row: UserRow) => {
    const isAdmin = adminIds.has(row.uid);
    if (isAdmin && row.uid === me?.uid) {
      toast.error("You cannot revoke your own admin access");
      return;
    }
    setSavingUid(row.uid);
    try {
      if (isAdmin) {
        await adminApi.revokeAdmin(row.uid);
        toast.success("Admin access revoked");
      } else {
        await adminApi.grantAdmin(row.uid);
        toast.success("Admin access granted");
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not update admin access");
    } finally {
      setSavingUid(null);
    }
  };

  if (loading) {
    return <Box sx={{ p: 4, textAlign: "center" }}><CircularProgress size={28} /></Box>;
  }

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, alignItems: "center", mb: 3, flexWrap: "wrap" }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>Users & Plans</Typography>
          <Typography variant="caption" color="text.secondary">
            Plans are written by the API, not the browser. Changes apply live and are audited.
          </Typography>
        </Box>
        <TextField
          size="small"
          placeholder="Search email, name or uid"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          slotProps={{ input: { startAdornment: <Search size={16} style={{ marginRight: 8, opacity: 0.5 }} /> } }}
          sx={{ minWidth: 260 }}
        />
      </Box>

      {readError && <Alert severity="error" sx={{ mb: 3 }}>{readError}</Alert>}

      <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
        {[
          { label: "Accounts", value: stats.total, icon: <Users size={16} /> },
          { label: "Paid plans", value: stats.paid, icon: <Shield size={16} /> },
          { label: "Admins", value: stats.admins, icon: <Shield size={16} /> },
          { label: "Tracked items", value: stats.tracked, icon: <Library size={16} /> },
        ].map((stat) => (
          <Paper key={stat.label} sx={{ px: 2.5, py: 1.5, flex: 1, minWidth: 140, bgcolor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "primary.main", mb: 0.5 }}>
              {stat.icon}
              <Typography variant="caption" color="text.secondary">{stat.label}</Typography>
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>{stat.value}</Typography>
          </Paper>
        ))}
      </Box>

      <Paper sx={{ border: "1px solid rgba(255,255,255,0.06)", bgcolor: "rgba(255,255,255,0.01)", overflow: "hidden" }}>
        {filtered.map((row, index) => {
          const effective = effectiveTier(row.subscriptionTier, row.subscriptionExpiresAt);
          const isAdmin = adminIds.has(row.uid);
          const saving = savingUid === row.uid;
          return (
            <Box key={row.uid}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2, p: 2, flexWrap: "wrap" }}>
                <Avatar sx={{ width: 38, height: 38, bgcolor: isAdmin ? "primary.main" : "rgba(255,255,255,0.08)" }}>
                  <User size={18} />
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 200 }}>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {row.displayName || row.email || row.uid}
                    </Typography>
                    {isAdmin && <Chip label="ADMIN" size="small" color="primary" sx={{ height: 18, fontSize: "0.6rem", fontWeight: 900 }} />}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {row.email || "no email"} • uid {row.uid.slice(0, 10)}… • {trackedByUser[row.uid] ?? 0} tracked
                  </Typography>
                </Box>

                <Chip
                  label={tierLabel(effective)}
                  size="small"
                  color={effective === "FREE" ? "default" : "success"}
                  variant={effective === "FREE" ? "outlined" : "filled"}
                  sx={{ fontWeight: 800 }}
                />
                {row.subscriptionExpiresAt && effective !== "FREE" && (
                  <Typography variant="caption" color="text.secondary">
                    until {String(row.subscriptionExpiresAt).slice(0, 10)}
                  </Typography>
                )}

                <Tooltip title="Change plan">
                  <IconButton size="small" onClick={() => openPlan(row)} disabled={saving}>
                    <Pencil size={16} />
                  </IconButton>
                </Tooltip>
                <Tooltip title={isAdmin ? "Revoke admin" : "Grant admin"}>
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => toggleAdmin(row)}
                      disabled={saving || (isAdmin && row.uid === me?.uid)}
                      color={isAdmin ? "warning" : "default"}
                    >
                      {saving ? <CircularProgress size={16} /> : isAdmin ? <ShieldOff size={16} /> : <Shield size={16} />}
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
              {index < filtered.length - 1 && <Divider sx={{ opacity: 0.06 }} />}
            </Box>
          );
        })}

        {filtered.length === 0 && (
          <Box sx={{ p: 6, textAlign: "center" }}>
            <Typography color="text.secondary">No accounts match that search.</Typography>
          </Box>
        )}
      </Paper>

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Plan for {editing?.email || editing?.uid}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel>Subscription tier</InputLabel>
            <Select
              value={planTier}
              label="Subscription tier"
              onChange={(event) => setPlanTier(normalizeTier(event.target.value))}
            >
              <MenuItem value="FREE">Free — 5 items, 30-day history</MenuItem>
              <MenuItem value="PRO">Pro — unlimited, full history, export</MenuItem>
              <MenuItem value="ENTERPRISE">Enterprise — higher quotas</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            size="small"
            type="date"
            label="Expires (optional)"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
            disabled={planTier === "FREE"}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ mt: 2 }}
            helperText={planTier === "FREE" ? "Free never expires." : "Leave blank for no expiry."}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
            The tier is enforced by the API and reflected in the app immediately. This action is written to the admin audit log.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditing(null)} color="inherit">Cancel</Button>
          <Button onClick={savePlan} variant="contained" disabled={savingUid !== null}>
            {savingUid ? "Saving…" : "Save plan"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
