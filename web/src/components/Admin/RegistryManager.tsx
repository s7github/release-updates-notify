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
import { collection, query, onSnapshot, doc, deleteDoc, updateDoc, setDoc, addDoc, getDocs, where, getDoc, writeBatch } from "firebase/firestore";
import { db } from "../../services/firebase";
import { discoverSources } from "../../services/gemini";
import toast from "react-hot-toast";

import { pollSoftware, pollSoftwareHistory } from "../../services/pollService";

const MANUAL_LOGO_OVERRIDES: Record<string, string> = {
  "fl studio": "https://logo.clearbit.com/image-line.com",
  "image-line": "https://logo.clearbit.com/image-line.com",
  "ableton live": "https://logo.clearbit.com/ableton.com",
  "logic pro": "https://logo.clearbit.com/apple.com",
  "suno": "https://logo.clearbit.com/suno.com"
};

const getLogo = (name: string, discoveredUrl: string | null) => {
  const key = name.toLowerCase();
  for (const [k, v] of Object.entries(MANUAL_LOGO_OVERRIDES)) {
    if (key.includes(k)) return v;
  }
  return discoveredUrl;
};

export default function RegistryManager() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [softwareToDelete, setSoftwareToDelete] = useState<any>(null);
  const [newSoftwareBatch, setNewSoftwareBatch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredRows = rows.filter(row => 
    row.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFullSync = async (software: any) => {
    setRefreshingId(software.id);
    const toastId = toast.loading(`Full Sync for ${software.name}...`);
    try {
      // 1. Refresh Metadata
      const discovery = await discoverSources(software.name);
      const updates = {
        vendor: discovery.vendor || software.vendor,
        website: discovery.website || software.website,
        icon_url: getLogo(software.name, discovery.icon_url) || software.icon_url,
        github_url: discovery.github_url || software.github_url,
        rss_url: discovery.rss_url || software.rss_url,
        suggested_priority: discovery.suggested_priority || software.suggested_priority,
        lastMetadataUpdate: new Date().toISOString()
      };
      await updateDoc(doc(db, "master_registry", software.id), updates);
      
      // 2. Poll for updates
      const updatedSoftware = { ...software, ...updates };
      await pollSoftware(updatedSoftware);
      
      toast.success(`${software.name} synced successfully!`, { id: toastId });
    } catch (error: any) {
      console.error(error);
      toast.error(`Sync failed: ${error.message}`, { id: toastId });
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDeepHistoryScrape = async (software: any) => {
    setHistoryLoadingId(software.id);
    const toastId = toast.loading(`Deep Scraping History for ${software.name}...`);
    try {
      const results = await pollSoftwareHistory(software);
      toast.success(`Discovered ${results.length} historical releases!`, { id: toastId });
    } catch (error: any) {
      console.error(error);
      toast.error(`Scrape failed: ${error.message}`, { id: toastId });
    } finally {
      setHistoryLoadingId(null);
    }
  };

  const handleAddSoftware = async () => {
    if (!newSoftwareBatch.trim()) return;
    const names = newSoftwareBatch.split(',').map(n => n.trim()).filter(n => n);
    const toastId = toast.loading(`Adding ${names.length} items...`);
    
    try {
      for (const name of names) {
        const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const docRef = doc(db, "master_registry", id);
        
        // Initial skeleton entry
        await setDoc(docRef, {
          name,
          vendor: "Pending Discovery",
          active: true,
          createdAt: new Date().toISOString()
        });
        
        // Trigger background discovery
        discoverSources(name).then(async (discovery) => {
          await updateDoc(docRef, {
            ...discovery,
            icon_url: getLogo(name, discovery.icon_url),
            lastMetadataUpdate: new Date().toISOString()
          });
        });
      }
      toast.success(`Started onboarding for ${names.length} items`, { id: toastId });
      setAddOpen(false);
      setNewSoftwareBatch("");
    } catch (e) {
      toast.error("Failed to add software");
    }
  };

  useEffect(() => {
    const q = query(collection(db, "master_registry"));
    const unsubscribe = onSnapshot(q, (snap) => {
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handlePoll = async (software: any) => {
    setPollingId(software.id);
    const toastId = toast.loading(`Polling ${software.name}...`);
    try {
      const extracted = await pollSoftware(software);
      toast.success(`New version ${extracted.version} found!`, { id: toastId });
    } catch (error: any) {
      console.error(error);
      toast.error(`Poll failed: ${error.message}`, { id: toastId });
    } finally {
      setPollingId(null);
    }
  };

  const deleteSoftware = async (id: string, name: string) => {
    console.log("Delete triggered for:", id, "Name:", name);
    const toastId = toast.loading(`Purging ${name}...`);
    try {
      const batch = writeBatch(db);
      
      // 1. Delete the registry entry
      batch.delete(doc(db, "master_registry", id));
      
      // 2. Delete all release notes
      const notesQ = query(collection(db, "release_notes"), where("softwareId", "==", id));
      const notesSnap = await getDocs(notesQ);
      notesSnap.forEach(n => batch.delete(n.ref));
      
      // 3. Delete all interests (user tracks)
      const interestsQ = query(collection(db, "interests"), where("softwareId", "==", id));
      const interestsSnap = await getDocs(interestsQ);
      interestsSnap.forEach(i => batch.delete(i.ref));
      
      await batch.commit();
      toast.success(`"${name}" and all associated data purged.`, { id: toastId });
    } catch (e: any) {
      console.error("Delete failed:", e);
      toast.error("Failed to delete: " + e.message, { id: toastId });
    } finally {
      setDeleteOpen(false);
      setSoftwareToDelete(null);
    }
  };

  const handlePollAll = async () => {
    const activeRows = rows.filter(r => r.active !== false);
    const toastId = toast.loading(`Initiating global poll for ${activeRows.length} items...`);
    let successCount = 0;
    
    for (const row of activeRows) {
      try {
        await pollSoftware(row);
        successCount++;
      } catch (e) {
        console.error(`Poll failed for ${row.name}`, e);
      }
    }
    
    toast.success(`Global scan complete. Updated ${successCount} items.`, { id: toastId });
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
            {params.row.name[0]}
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
            Showing <b>{filteredRows.length}</b> of <b>{rows.length}</b> items in software catalogue.
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
        rows={filteredRows}
        columns={columns}
        loading={loading}
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

