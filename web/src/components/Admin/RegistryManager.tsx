import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Box, 
  Button, 
  Typography, 
  IconButton, 
  Tooltip, 
  CircularProgress, 
  Avatar, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  TextField,
  Chip,
  DialogContentText
} from "@mui/material";
import { DataGrid, GridColDef, GridActionsCellItem } from "@mui/x-data-grid";
import { RefreshCw, Trash2, Edit2, Zap, ExternalLink, Globe, Github, Rss, Settings, Database, Search, CheckCircle, AlertTriangle } from "lucide-react";
import { collection, query, onSnapshot, orderBy, limit } from "firebase/firestore";
import { normaliseSearch, searchCatalog } from "../../services/catalogSearch";
import { db } from "../../services/firebase";
import { adminApi, ApiError } from "../../services/api";
import toast from "react-hot-toast";

export default function RegistryManager() {
  const navigate = useNavigate();
  // `live` is the most recently checked slice, kept current; `found` is a search
  // over the whole catalogue. Listening to all ~15k entries cost 15k reads per page load.
  const [live, setLive] = useState<any[]>([]);
  const [found, setFound] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [softwareToDelete, setSoftwareToDelete] = useState<any>(null);
  const [newSoftwareBatch, setNewSoftwareBatch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const rows = found ?? live;

  const handleFullSync = async (software: any) => {
    setRefreshingId(software.id);
    const toastId = toast.loading(`Full Sync for ${software.name}...`);
    try {
      const discovered = await adminApi.discoverRegistry(software.id);
      await adminApi.pollRegistry(software.id);
      if (discovered.warning) {
        toast(`${software.name}: poll queued. ${discovered.warning}`, { id: toastId, icon: "⚠️", duration: 7000 });
      } else {
        toast.success(`${software.name} sources refreshed and a poll queued`, { id: toastId });
      }
    } catch (error: any) {
      toast.error(error instanceof ApiError ? error.message : "Sync failed", { id: toastId });
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDeepHistoryScrape = async (software: any) => {
    setHistoryLoadingId(software.id);
    const toastId = toast.loading(`Queueing deep history for ${software.name}...`);
    try {
      await adminApi.pollRegistry(software.id, { includeHistory: true });
      toast.success("History scrape queued — progress is on the Processing page", { id: toastId });
    } catch (error: any) {
      toast.error(error instanceof ApiError ? error.message : "Scrape failed", { id: toastId });
    } finally {
      setHistoryLoadingId(null);
    }
  };

  const handleAddSoftware = async () => {
    if (!newSoftwareBatch.trim()) return;
    const names = newSoftwareBatch.split(',').map(n => n.trim()).filter(n => n);
    const toastId = toast.loading(`Adding ${names.length} items...`);
    const failures: string[] = [];
    let added = 0;

    try {
      for (const name of names) {
        try {
          const result = await adminApi.createRegistry(name, true);
          added += 1;
          if (result.warning) failures.push(`${name}: ${result.warning}`);
        } catch (error) {
          failures.push(`${name}: ${error instanceof ApiError ? error.message : "failed"}`);
        }
      }
      if (failures.length > 0) {
        toast.error(`Added ${added}. ${failures.join(" · ")}`, { id: toastId, duration: 8000 });
      } else {
        toast.success(`Onboarded ${added} items`, { id: toastId });
      }
      setAddOpen(false);
      setNewSoftwareBatch("");
      if (names[0]) setSearchTerm(names[0]);
    } catch (e) {
      toast.error("Failed to add software", { id: toastId });
    }
  };

  useEffect(() => {
    const q = query(collection(db, "master_registry"), orderBy("lastCheck", "desc"), limit(100));
    const unsubscribe = onSnapshot(q, (snap) => {
      setLive(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => {
      setLoading(false);
      toast.error("Could not read the catalogue");
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const text = searchTerm.trim();
    if (normaliseSearch(text).length < 2) {
      setFound(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const hits = await searchCatalog(text, { includeInactive: true });
        if (!cancelled) setFound(hits);
      } catch {
        if (!cancelled) toast.error("Search failed");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  const handlePoll = async (software: any) => {
    setPollingId(software.id);
    const toastId = toast.loading(`Queueing poll for ${software.name}...`);
    try {
      await adminApi.pollRegistry(software.id);
      toast.success("Poll queued — the pipeline will report on the Processing page", { id: toastId });
    } catch (error: any) {
      toast.error(error instanceof ApiError ? error.message : "Poll failed", { id: toastId });
    } finally {
      setPollingId(null);
    }
  };

  const deleteSoftware = async (id: string, name: string) => {
    const toastId = toast.loading(`Purging ${name}...`);
    try {
      const result = await adminApi.deleteRegistry(id, name);
      setFound((current) => current && current.filter((row) => row.id !== id));
      toast.success(`"${name}" and all associated data purged (${result.deletedReleases} releases).`, { id: toastId });
    } catch (e: any) {
      toast.error(e instanceof ApiError ? e.message : "Failed to delete", { id: toastId });
    } finally {
      setDeleteOpen(false);
      setSoftwareToDelete(null);
    }
  };

  const handlePollAll = async () => {
    const toastId = toast.loading("Queueing every active catalog entry...");
    try {
      const result = await adminApi.pollAll();
      toast.success(
        `Queued ${result.enqueued} polls${result.failures.length ? `; ${result.failures.length} failed` : ""}`,
        { id: toastId },
      );
    } catch (error: any) {
      toast.error(error instanceof ApiError ? error.message : "Scan failed", { id: toastId });
    }
  };

  const columns: GridColDef[] = [
    { 
      field: 'name', 
      headerName: 'Software Name', 
      flex: 1,
      minWidth: 250,
      renderCell: (params) => (
        <Box 
          onClick={() => navigate(`/software/${params.id}`)}
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 2, 
            cursor: 'pointer',
            height: '100%',
            '&:hover': { color: 'primary.main' }
          }}
        >
          <Avatar 
            src={params.row.icon_url} 
            sx={{ width: 32, height: 32, bgcolor: 'rgba(255,255,255,0.05)' }}
          >
            {String(params.row.name ?? "?")[0]}
          </Avatar>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{params.row.name}</Typography>
            <Typography variant="caption" color="text.secondary">{params.row.vendor}</Typography>
          </Box>
        </Box>
      )
    },
    { 
      field: 'sources', 
      headerName: 'Principal Sources', 
      width: 320,
      renderCell: (params) => {
        const priority = (params.row.suggested_priority || []) as string[];
        return (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'nowrap', overflow: 'hidden' }}>
            {params.row.sourcesVerified && (
              <Tooltip title="Sources Verified">
                <CheckCircle size={14} color="#00FF7F" />
              </Tooltip>
            )}
            {params.row.rss_url && (
              <Tooltip title={`RSS Feed (Priority: ${priority.indexOf('rss') + 1})`}>
                <Chip size="small" icon={<Rss size={12} />} label="RSS" variant="outlined" sx={{ fontSize: 10, height: 22 }} />
              </Tooltip>
            )}
            {params.row.github_url && (
              <Tooltip title={`GitHub (Priority: ${priority.indexOf('github') + 1})`}>
                <Chip size="small" icon={<Github size={12} />} label="Repo" variant="outlined" sx={{ fontSize: 10, height: 22 }} />
              </Tooltip>
            )}
            {params.row.website && (
              <Tooltip title={`Website (Priority: ${priority.indexOf('website') + 1})`}>
                <Chip size="small" icon={<Globe size={12} />} label="Web" variant="outlined" sx={{ fontSize: 10, height: 22 }} />
              </Tooltip>
            )}
            {priority.length > 0 && (
              <Tooltip title={`Priority Order: ${priority.join(' > ')}`}>
                <Database size={14} style={{ opacity: 0.5 }} />
              </Tooltip>
            )}
          </Box>
        );
      }
    },
    { 
      field: 'lastReleaseDate', 
      headerName: 'Latest Update', 
      width: 150,
      valueGetter: (value) => value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'Never'
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Actions',
      width: 130,
      getActions: (params) => [
        <GridActionsCellItem
          key="poll"
          icon={
            <Tooltip title="Quick Update Scan">
              <RefreshCw size={18} className={pollingId === params.id ? "animate-spin" : ""} />
            </Tooltip>
          }
          label="Poll Update"
          onClick={() => handlePoll(params.row)}
          disabled={pollingId !== null}
        />,
        <GridActionsCellItem
          key="manage"
          icon={
            <Tooltip title="Product Management (Admin)">
              <Settings size={18} />
            </Tooltip>
          }
          label="Manage"
          onClick={() => navigate(`/software/${params.id}`)}
        />,
        <GridActionsCellItem
          key="delete"
          icon={
            <Tooltip title="Deep Delete Product">
              <Trash2 size={18} color="#ff4d4d" />
            </Tooltip>
          }
          label="Purge Item"
          onClick={() => {
            setSoftwareToDelete(params.row);
            setDeleteOpen(true);
          }}
        />,
      ],
    },
  ];

  return (
    <Box sx={{ height: '75vh', width: '100%', mt: 2 }}>
      <Box sx={{ mb: 3, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'flex-start', md: 'center' }, gap: 2 }}>
        <Box sx={{ flex: 1, display: 'flex', gap: 2, alignItems: 'center', width: '100%' }}>
          <TextField
            placeholder="Search registry..."
            size="small"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            slotProps={{
              input: {
                startAdornment: <Search size={16} style={{ marginRight: 8, opacity: 0.5 }} />,
              }
            }}
            sx={{ flex: 1, maxWidth: 400 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', lg: 'block' } }}>
            {found ? <>Found <b>{rows.length}</b> matches.</> : <>Showing the <b>{rows.length}</b> most recently checked. Search to find any catalogue entry.</>}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, width: { xs: '100%', md: 'auto' } }}>
          <Button 
            variant="contained" 
            startIcon={<Zap size={18} />} 
            onClick={() => setAddOpen(true)}
            size="small"
            fullWidth={true}
            sx={{ flex: 1 }}
          >
            Add Software
          </Button>
          <Button 
            variant="outlined" 
            startIcon={<RefreshCw size={18} />} 
            onClick={handlePollAll}
            size="small"
            fullWidth={true}
            sx={{ flex: 1 }}
          >
            Scan All
          </Button>
        </Box>
      </Box>
      <DataGrid
        rows={rows}
        columns={columns}
        loading={loading || searching}
        disableRowSelectionOnClick
        rowHeight={60}
        sx={{
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 2,
          bgcolor: 'background.paper',
          overflow: 'hidden',
          '& .MuiDataGrid-cell': {
            borderColor: 'rgba(255, 255, 255, 0.05)',
            display: 'flex',
            alignItems: 'center'
          },
          '& .MuiDataGrid-columnHeaders': {
            borderColor: 'rgba(255, 255, 255, 0.1)',
            bgcolor: 'rgba(255, 255, 255, 0.02)',
          },
        }}
      />

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Add New Software</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Enter software names separated by commas. AI will automatically discover sources.
          </Typography>
          <TextField 
            label="Software Names" 
            fullWidth 
            multiline
            rows={4}
            variant="filled"
            placeholder="Visual Studio Code, Docker, Postman..."
            value={newSoftwareBatch}
            onChange={(e) => setNewSoftwareBatch(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setAddOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={handleAddSoftware} variant="contained" disabled={!newSoftwareBatch.trim()}>Onboard</Button>
        </DialogActions>
      </Dialog>

      <Dialog 
        open={deleteOpen} 
        onClose={() => setDeleteOpen(false)}
        slotProps={{ paper: { sx: { bgcolor: '#1a1a1a', borderRadius: 3, border: '1px solid rgba(255,255,255,0.1)' } } }}
      >
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', gap: 1, alignItems: 'center' }}>
          <AlertTriangle color="#ff4d4d" /> Confirm Product Purge
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 2 }}>
            Are you absolutely sure you want to delete <b>{softwareToDelete?.name}</b>?
          </Typography>
          <Typography variant="caption" color="error" sx={{ fontWeight: 700 }}>
            WARNING: This will permanently delete the product, all release notes, and all user tracking data. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteOpen(false)} sx={{ color: 'text.secondary' }}>Cancel</Button>
          <Button 
            onClick={() => deleteSoftware(softwareToDelete.id, softwareToDelete.name)} 
            variant="contained" 
            color="error"
            sx={{ fontWeight: 700 }}
          >
            Purge Registry Item
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

