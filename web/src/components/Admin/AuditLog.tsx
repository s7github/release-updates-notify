import { useEffect, useState } from "react";
import {
  Box, Typography, Paper, Chip, CircularProgress, Tooltip,
} from "@mui/material";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { formatDistanceToNow } from "date-fns";
import { ShieldCheck, User, Database, FileText, ListChecks } from "lucide-react";
import { db } from "../../services/firebase";

interface AuditEntry {
  id: string;
  actorUid?: string;
  actorEmail?: string | null;
  action?: string;
  targetType?: string;
  targetId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  createdAt?: string;
}

const iconFor = (targetType?: string) => {
  if (targetType === "software") return <Database size={15} />;
  if (targetType === "release") return <FileText size={15} />;
  if (targetType === "user") return <User size={15} />;
  return <ListChecks size={15} />;
};

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "admin_audit"), orderBy("createdAt", "desc"), limit(100)),
      (snap) => {
        setEntries(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as AuditEntry)));
        setLoading(false);
        setError(null);
      },
      () => {
        setLoading(false);
        setError("The audit log could not be read. Check that your account has admin access.");
      },
    );
  }, []);

  if (loading) return <Box sx={{ p: 4, textAlign: "center" }}><CircularProgress size={28} /></Box>;

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 1 }}>
          <ShieldCheck size={18} /> Admin Audit Log
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Every privileged mutation, written by the API with the Admin SDK. Clients cannot forge entries.
        </Typography>
      </Box>

      {error && <Paper sx={{ p: 3, color: "error.main", bgcolor: "rgba(255,0,0,0.04)" }}>{error}</Paper>}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {entries.map((entry) => (
          <Paper key={entry.id} sx={{ p: 2, bgcolor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
              <Box sx={{ color: "primary.main", display: "flex" }}>{iconFor(entry.targetType)}</Box>
              <Chip label={entry.action || "unknown"} size="small" sx={{ fontFamily: "monospace", fontSize: "0.68rem", fontWeight: 700 }} />
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {entry.targetType} · {entry.targetId}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
                {entry.actorEmail || entry.actorUid || "unknown admin"} • {entry.createdAt ? formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true }) : ""}
              </Typography>
            </Box>

            {(entry.before || entry.after) && (
              <Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
                <Tooltip title="Values before the change">
                  <Box sx={{ p: 1, borderRadius: 1, bgcolor: "rgba(255,0,0,0.04)", overflow: "hidden" }}>
                    <Typography variant="caption" color="text.disabled">BEFORE</Typography>
                    <Typography component="pre" variant="caption" sx={{ display: "block", m: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflow: "auto" }}>
                      {JSON.stringify(entry.before ?? null, null, 2)}
                    </Typography>
                  </Box>
                </Tooltip>
                <Tooltip title="Values after the change">
                  <Box sx={{ p: 1, borderRadius: 1, bgcolor: "rgba(0,255,127,0.04)", overflow: "hidden" }}>
                    <Typography variant="caption" color="text.disabled">AFTER</Typography>
                    <Typography component="pre" variant="caption" sx={{ display: "block", m: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflow: "auto" }}>
                      {JSON.stringify(entry.after ?? null, null, 2)}
                    </Typography>
                  </Box>
                </Tooltip>
              </Box>
            )}
          </Paper>
        ))}

        {entries.length === 0 && !error && (
          <Paper sx={{ p: 5, textAlign: "center", bgcolor: "transparent", border: "2px dashed rgba(255,255,255,0.06)" }}>
            <Typography color="text.secondary">No admin actions recorded yet.</Typography>
          </Paper>
        )}
      </Box>
    </Box>
  );
}
