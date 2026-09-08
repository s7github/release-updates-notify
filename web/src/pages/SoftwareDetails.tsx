import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  Container, Typography, Box, Grid, Button, IconButton, 
  CircularProgress, Divider, Avatar, Chip, Paper, TextField, 
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Tooltip,
  Link
} from "@mui/material";
import { 
  ArrowLeft, Calendar, History, ExternalLink, Info, 
  Tag, Download, Globe, Trash2, Edit3, Save, X, 
  AlertTriangle, Filter, Database, Zap, RefreshCw, CheckCircle,
  ShieldCheck, GripVertical, ChevronUp, ChevronDown, List, Activity
} from "lucide-react";
import { 
  DndContext, 
  closestCenter,
  useSensor,
  useSensors,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  collection, query, where, orderBy, onSnapshot, 
  doc, getDoc, updateDoc, deleteDoc, writeBatch, getDocs,
  limit
} from "firebase/firestore";
import { db } from "../services/firebase";
import { pollSoftware } from "../services/pollService";
import { discoverSources } from "../services/gemini";
import Markdown from "react-markdown";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../App";
import toast from "react-hot-toast";
import { 
  DialogContentText 
} from "@mui/material";
import ScrapeHistoryView from "../components/ScrapeHistoryView";

// ... helpers

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

const getCategoryColor = (category: string) => {
  switch (category) {
    case "Security Patches": return { bg: 'rgba(255, 69, 58, 0.1)', text: '#FF453A' };
    case "Major Milestone Update": return { bg: 'rgba(255, 215, 0, 0.15)', text: '#FFD700' };
    case "New Features": return { bg: 'rgba(0, 255, 127, 0.1)', text: '#00FF7F' };
    default: return { bg: 'rgba(242, 125, 38, 0.1)', text: '#F27D26' };
  }
};

function SortablePriorityItem({ field, idx, priorityLength, editedSoftware, setEditedSoftware, movePriority }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 99 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <Paper 
      ref={setNodeRef} 
      style={style} 
      sx={{ 
        p: 1, 
        display: 'flex', 
        gap: 1, 
        alignItems: 'center', 
        bgcolor: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        mb: 1
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', mr: 0.5 }}>
        <IconButton 
          size="small" 
          sx={{ p: 0.2 }} 
          disabled={idx === 0} 
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            movePriority(idx, 'up');
          }}
        >
          <ChevronUp size={16} />
        </IconButton>
        <IconButton 
          size="small" 
          sx={{ p: 0.2 }} 
          disabled={idx === priorityLength - 1} 
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            movePriority(idx, 'down');
          }}
        >
          <ChevronDown size={16} />
        </IconButton>
      </Box>
      <Box 
        {...attributes} 
        {...listeners} 
        sx={{ 
          cursor: 'grab', 
          display: 'flex', 
          alignItems: 'center', 
          p: 0.5,
          color: 'text.secondary',
          touchAction: 'none',
          '&:active': { cursor: 'grabbing', color: 'primary.main' }
        }}
      >
        <GripVertical size={20} />
      </Box>
      <Box sx={{ flex: 1 }}>
        <TextField 
          label={field.label} size="small" fullWidth 
          value={editedSoftware?.[field.key] || ''} 
          onChange={e => setEditedSoftware({...editedSoftware, [field.key]: e.target.value})}
        />
      </Box>
    </Paper>
  );
}

export default function SoftwareDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  
  const [software, setSoftware] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNote, setSelectedNote] = useState<any>(null);

  // Edit Mode
  const [editMode, setEditMode] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [editedSoftware, setEditedSoftware] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [historyScrapeOpen, setHistoryScrapeOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    const q = query(
      collection(db, "background_tasks"),
      where("softwareId", "==", id),
      where("status", "==", "processing"),
      limit(1)
    );
    return onSnapshot(q, (snap) => {
      setActiveTask(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
    });
  }, [id]);
  
  // Bulk Delete
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleFullSync = async () => {
    if (!software) return;
    setIsSyncing(true);
    const toastId = toast.loading(`Full Sync for ${software.name}...`);
    try {
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
      await updateDoc(doc(db, "master_registry", id!), updates);
      
      const updatedSoftware = { ...software, ...updates };
      setSoftware(updatedSoftware);
      setEditedSoftware(updatedSoftware);
      
      await pollSoftware(updatedSoftware);
      toast.success(`${software.name} synced and updated!`, { id: toastId });
    } catch (error: any) {
      toast.error(`Sync failed: ${error.message}`, { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeepHistoryScrape = () => {
    if (activeTask) {
      navigate('/admin/processing');
    } else {
      setHistoryScrapeOpen(true);
    }
  };

  const [isAIVerifying, setIsAIVerifying] = useState(false);

  const fetchSoftware = async () => {
    if (!id) return;
    const sDoc = await getDoc(doc(db, "master_registry", id));
    if (sDoc.exists()) {
      const data = { id: sDoc.id, ...sDoc.data() };
      setSoftware(data);
      setEditedSoftware(data);
    }
  };

  const handleAIVerifySources = async () => {
    if (!software || !id) return;
    setIsAIVerifying(true);
    const tid = toast.loading(`AI Agent is analyzing sources for ${software.name}...`);
    try {
      const discovered = await discoverSources(software.name);
      if (discovered) {
        const newSources = {
          website: discovered.website || software.website,
          github_url: discovered.github_url || software.github_url,
          rss_url: discovered.rss_url || software.rss_url,
          changelog_url: discovered.changelog_url || software.changelog_url,
          suggested_priority: discovered.suggested_priority || software.suggested_priority || [],
          sourcesVerified: true
        };
        await updateDoc(doc(db, "master_registry", id), newSources);
        setSoftware({...software, ...newSources});
        if (editedSoftware) {
          setEditedSoftware({...editedSoftware, ...newSources});
        }
        toast.success(`Sources verified and updated for ${software.name}`, { id: tid });
      } else {
        toast.error("AI could not find alternative sources.", { id: tid });
      }
    } catch (e: any) {
      console.error(e);
      toast.error("AI Verification failed: " + e.message, { id: tid });
    } finally {
      setIsAIVerifying(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    fetchSoftware();

    const q = query(
      collection(db, "release_notes"),
      where("softwareId", "==", id),
      orderBy("releaseDate", "desc")
    );

    return onSnapshot(q, (snap) => {
      const allNotes = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setNotes(allNotes);
      
      // Handle the case where the currently selected note is deleted remotely
      setSelectedNote((prev: any) => {
        if (!prev) return allNotes[0] || null;
        const stillExists = allNotes.find((n: any) => n.id === prev.id);
        return stillExists || allNotes[0] || null;
      });
      
      setLoading(false);
    });
  }, [id]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const performDeleteProduct = async () => {
    const toastId = toast.loading("Deleting product...");
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "master_registry", id!));
      const notesQ = query(collection(db, "release_notes"), where("softwareId", "==", id));
      const notesSnap = await getDocs(notesQ);
      notesSnap.forEach(n => batch.delete(n.ref));
      const interestsQ = query(collection(db, "interests"), where("softwareId", "==", id));
      const interestsSnap = await getDocs(interestsQ);
      interestsSnap.forEach(i => batch.delete(i.ref));
      await batch.commit();
      toast.success("Product and all data purged successfully", { id: toastId });
      navigate('/library');
    } catch (e: any) {
      toast.error("Failed to delete product: " + e.message, { id: toastId });
    } finally {
      setDeleteDialogOpen(false);
    }
  };

  const getSanitizedPriority = (priority: any): string[] => {
    const DEFAULT_PRIORITY = ['rss', 'changelog', 'registry', 'github'];
    let p = Array.isArray(priority) ? [...priority] : [...DEFAULT_PRIORITY];
    const missing = DEFAULT_PRIORITY.filter(item => !p.includes(item));
    p = [...p, ...missing];
    return p;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setEditedSoftware((prev: any) => {
        if (!prev) return prev;
        const priority = getSanitizedPriority(prev.suggested_priority);
        const oldIndex = priority.indexOf(active.id as string);
        const newIndex = priority.indexOf(over.id as string);
        if (oldIndex === -1 || newIndex === -1) return prev;
        const newPriority = arrayMove(priority, oldIndex, newIndex);
        return { ...prev, suggested_priority: newPriority };
      });
    }
  };

  const movePriority = (index: number, direction: 'up' | 'down') => {
    setEditedSoftware((prev: any) => {
      if (!prev) return prev;
      const priority = getSanitizedPriority(prev.suggested_priority);
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      
      if (newIndex < 0 || newIndex >= priority.length) return prev;
      
      const newPriority = arrayMove(priority, index, newIndex);
      return { ...prev, suggested_priority: newPriority };
    });
  };

  const handleSaveSoftware = async () => {
    if (!id || !editedSoftware) return;
    const toastId = toast.loading("Saving changes...");
    try {
      // Create a clean copy to save
      const { id: _, ...dataToSave } = editedSoftware;
      
      // Ensure suggested_priority is part of the update
      await updateDoc(doc(db, "master_registry", id), {
        ...dataToSave,
        lastMetadataUpdate: new Date().toISOString()
      });
      
      setSoftware(editedSoftware);
      setEditMode(false);
      toast.success("Software information updated", { id: toastId });
    } catch (e: any) {
      console.error("Save error:", e);
      toast.error("Failed to save changes: " + e.message, { id: toastId });
    }
  };

  const toggleVerifyNote = async (noteId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, "release_notes", noteId), { isVerified: !currentStatus });
      toast.success(currentStatus ? "Marked as unverified" : "Marked as verified");
    } catch (e) {
      toast.error("Failed to update verification status");
    }
  };

  const deleteNote = async (noteId: string) => {
    try {
      await deleteDoc(doc(db, "release_notes", noteId));
      
      // Update local and remote lastVersion if we just deleted the latest one
      const remainingNotes = notes.filter(n => n.id !== noteId);
      if (selectedNote?.id === noteId) {
        setSelectedNote(remainingNotes[0] || null);
      }

      if (remainingNotes.length > 0) {
        const latestVersion = remainingNotes[0].version;
        if (software.lastVersion !== latestVersion) {
          await updateDoc(doc(db, "master_registry", id!), { lastVersion: latestVersion });
          setSoftware({ ...software, lastVersion: latestVersion });
        }
      } else {
        await updateDoc(doc(db, "master_registry", id!), { lastVersion: "N/A" });
        setSoftware({ ...software, lastVersion: "N/A" });
      }

      toast.success("Release note removed");
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to delete note: " + e.message);
    }
  };

  const handleBulkDelete = async () => {
    let toDelete = notes;
    
    if (startDate) {
      const start = new Date(startDate);
      toDelete = toDelete.filter(n => new Date(n.releaseDate) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      toDelete = toDelete.filter(n => new Date(n.releaseDate) <= end);
    }

    if (toDelete.length === 0) {
      toast.error("No notes found in that range");
      return;
    }

    const toastId = toast.loading(`Deleting ${toDelete.length} notes...`);
    try {
      const batch = writeBatch(db);
      toDelete.forEach(n => {
        batch.delete(doc(db, "release_notes", n.id));
      });
      
      const deleteIds = new Set(toDelete.map(d => d.id));
      const survivingNotes = notes.filter(n => !deleteIds.has(n.id));

      if (survivingNotes.length > 0) {
        const latestVersion = survivingNotes[0].version;
        batch.update(doc(db, "master_registry", id!), { lastVersion: latestVersion });
        setSoftware({ ...software, lastVersion: latestVersion });
      } else {
        batch.update(doc(db, "master_registry", id!), { lastVersion: "N/A" });
        setSoftware({ ...software, lastVersion: "N/A" });
      }

      await batch.commit();
      toast.success(`Success! Deleted ${toDelete.length} release notes.`, { id: toastId });
      setBulkDeleteOpen(false);
      
      if (selectedNote && deleteIds.has(selectedNote.id)) {
        setSelectedNote(survivingNotes[0] || null);
      }
    } catch (e: any) {
      console.error(e);
      toast.error("Bulk delete failed: " + e.message, { id: toastId });
    }
  };

  if (loading) return (
    <Box sx={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress />
    </Box>
  );

  if (!software && !loading) return (
    <Container sx={{ py: 8, textAlign: 'center' }}>
      <Typography variant="h5">Software not found</Typography>
      <Button startIcon={<ArrowLeft />} onClick={() => navigate(-1)} sx={{ mt: 2 }}>Go Back</Button>
    </Container>
  );

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 }, px: { xs: 1, sm: 2, md: 3 } }}>
      <Box sx={{ mb: 4 }}>
        <Button 
          startIcon={<ArrowLeft size={18} />} 
          onClick={() => navigate(-1)} 
          sx={{ color: 'text.secondary', p: 0.2, minWidth: 'auto', mb: 2, textTransform: 'none', '&:hover': { bgcolor: 'transparent', color: 'primary.main' } }}
        >
          Back
        </Button>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
            <Avatar 
              src={getLogo(software?.name || '', software?.icon_url)}
              sx={{ 
                bgcolor: 'primary.main', 
                width: { xs: 56, md: 72 }, 
                height: { xs: 56, md: 72 },
                borderRadius: 3,
                boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
                fontSize: '1.5rem',
                fontWeight: 900
              }}
            >
              {software?.name?.[0] || "?"}
            </Avatar>
            <Box>
              <Typography variant="h2" sx={{ fontWeight: 900, lineHeight: 1.1, fontSize: { xs: '2rem', md: '3.5rem' }, letterSpacing: -1 }}>{software?.name || "Product"}</Typography>
              <Typography variant="h6" color="text.secondary" sx={{ opacity: 0.7, fontWeight: 500 }}>{software?.vendor || "Software Information"}</Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      <Grid container spacing={4}>
        {/* Sidebar / Timeline */}
        <Grid size={{ xs: 12, md: 4, lg: 3 }}>
          <Box sx={{ position: { md: 'sticky' }, top: 24 }}>
            {editMode ? (
              <Paper sx={{ p: 3, mb: 3, border: '1px solid rgba(255,255,255,0.1)', bgcolor: 'rgba(242, 125, 38, 0.05)' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.main' }}>Edit Mode</Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button 
                      size="small" 
                      onClick={() => {
                        setEditMode(false);
                        setEditedSoftware(software);
                      }}
                      sx={{ color: 'text.secondary', minWidth: 'auto', p: 0.5 }}
                    >
                      <X size={18} />
                    </Button>
                    <Button 
                      variant="contained" 
                      size="small" 
                      onClick={handleSaveSoftware}
                      startIcon={<Save size={14} />}
                      sx={{ fontWeight: 700, borderRadius: 2 }}
                    >
                      Save
                    </Button>
                  </Box>
                </Box>
                
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box>
                    <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: 1, color: 'text.secondary', mb: 1, display: 'block' }}>
                      Official Information
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <TextField 
                        label="Name" size="small" fullWidth 
                        value={editedSoftware?.name || ''} 
                        onChange={e => setEditedSoftware({...editedSoftware, name: e.target.value})}
                      />
                      <TextField 
                        label="Vendor" size="small" fullWidth 
                        value={editedSoftware?.vendor || ''} 
                        onChange={e => setEditedSoftware({...editedSoftware, vendor: e.target.value})}
                      />
                      <TextField 
                        label="Official Website" size="small" fullWidth 
                        value={editedSoftware?.website || ''} 
                        onChange={e => setEditedSoftware({...editedSoftware, website: e.target.value})}
                      />
                      <TextField 
                        label="Source Code (GitHub URL)" size="small" fullWidth 
                        value={editedSoftware?.github_url || ''} 
                        onChange={e => setEditedSoftware({...editedSoftware, github_url: e.target.value})}
                      />
                    </Box>
                  </Box>

                  <Divider sx={{ opacity: 0.1 }} />


                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                      <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: 1, color: 'text.secondary' }}>
                        Data Sources Priority (Drag to Sort)
                      </Typography>
                    </Box>
                      <DndContext 
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext 
                          items={(() => {
                            const priority = getSanitizedPriority(editedSoftware?.suggested_priority);
                            const fields = [
                              { id: 'rss', label: 'RSS Feed URL', key: 'rss_url' },
                              { id: 'changelog', label: 'Changelog URL', key: 'changelog_url' },
                              { id: 'registry', label: 'Package Registry URL', key: 'package_registry_url' },
                              { id: 'github', label: 'GitHub API/Releases URL', key: 'github_url' },
                            ];
                            return fields.sort((a, b) => {
                              const pA = priority.indexOf(a.id);
                              const pB = priority.indexOf(b.id);
                              const sortA = pA === -1 ? 999 : pA;
                              const sortB = pB === -1 ? 999 : pB;
                              return sortA - sortB;
                            }).map(f => f.id);
                          })()}
                          strategy={verticalListSortingStrategy}
                        >
                          {(() => {
                            const fields = [
                              { id: 'rss', label: 'RSS Feed URL', key: 'rss_url' },
                              { id: 'changelog', label: 'Changelog URL', key: 'changelog_url' },
                              { id: 'registry', label: 'Package Registry URL', key: 'package_registry_url' },
                              { id: 'github', label: 'GitHub API/Releases URL', key: 'github_url' },
                            ];
                            const priority = getSanitizedPriority(editedSoftware?.suggested_priority);
                            const sortedFields = fields.sort((a, b) => {
                              const pA = priority.indexOf(a.id);
                              const pB = priority.indexOf(b.id);
                              const sortA = pA === -1 ? 999 : pA;
                              const sortB = pB === -1 ? 999 : pB;
                              return sortA - sortB;
                            });

                            return sortedFields.map((field, idx) => (
                              <SortablePriorityItem 
                                key={field.id}
                                field={field} 
                                idx={idx}
                                priorityLength={sortedFields.length}
                                movePriority={movePriority}
                                priority={priority}
                                editedSoftware={editedSoftware}
                                setEditedSoftware={setEditedSoftware}
                              />
                            ));
                          })()}
                        </SortableContext>
                      </DndContext>
                  </Box>
                </Box>
              </Paper>
            ) : (
              <>
                <Paper sx={{ p: 3, mb: 3, border: '1px solid rgba(255,255,255,0.1)', bgcolor: 'rgba(255,255,255,0.01)', position: 'relative' }}>
                  {isAdmin && (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5, mb: 2 }}>
                      <Tooltip title="Pull latest updates (Sync)">
                        <IconButton 
                          size="small"
                          onClick={handleFullSync} 
                          disabled={isSyncing}
                          sx={{ bgcolor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
                        >
                          <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit Metadata">
                        <IconButton 
                          size="small"
                          onClick={() => setEditMode(true)}
                          sx={{ bgcolor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
                        >
                          <Edit3 size={16} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete Product">
                        <IconButton 
                          size="small"
                          color="error"
                          onClick={() => setDeleteDialogOpen(true)}
                          sx={{ bgcolor: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.2)', '&:hover': { bgcolor: 'rgba(255,0,0,0.2)' } }}
                        >
                          <Trash2 size={16} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                  
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">Project Overview</Typography>
                      <Chip label={software?.category || "Utility"} size="small" sx={{ height: 20, fontSize: '0.65rem' }} />
                    </Box>
                    
                    <Divider sx={{ opacity: 0.1 }} />
                    
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">Current Version</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>{software?.lastVersion || 'N/A'}</Typography>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">Major Releases</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>{notes.filter(n => n.category === "Major Milestone Update").length}</Typography>
                    </Box>
                    
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">Last Checked</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {software?.lastCheck ? new Date(software.lastCheck).toLocaleDateString() : 'Never'}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>

                <Paper sx={{ p: 2, mb: 3, border: '1px solid rgba(255,255,255,0.1)', bgcolor: 'rgba(255,255,255,0.03)' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                      <Database size={14} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                      Data Sources
                    </Typography>
                    {isAdmin && (
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {software?.sourcesVerified && (
                          <Tooltip title="Sources Verified">
                            <CheckCircle size={14} color="#00FF7F" style={{ marginRight: 4 }} />
                          </Tooltip>
                        )}
                        <Tooltip title="Verify Sources via AI">
                          <IconButton size="small" onClick={handleAIVerifySources} disabled={isAIVerifying} color="info">
                            <RefreshCw size={14} className={isAIVerifying ? "animate-pulse" : ""} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    {(() => {
                      const sources = [
                        { id: 'github', label: 'GitHub', url: software?.github_url?.replace(/\.git$/, '') + '/releases', icon: <ExternalLink size={12} /> },
                        { id: 'rss', label: 'RSS Feed', url: software?.rss_url, icon: <ExternalLink size={12} /> },
                        { id: 'changelog', label: 'Changelog', url: software?.changelog_url, icon: <ExternalLink size={12} /> },
                        { id: 'registry', label: 'Registry', url: software?.package_registry_url, icon: <ExternalLink size={12} /> },
                      ].filter(s => s.url);

                      const priority = (software?.suggested_priority || ['github', 'rss', 'changelog', 'registry']) as string[];
                      
                      return sources.sort((a, b) => {
                        const pA = priority.indexOf(a.id);
                        const pB = priority.indexOf(b.id);
                        if (pA === -1 && pB === -1) return 0;
                        if (pA === -1) return 1;
                        if (pB === -1) return -1;
                        return pA - pB;
                      }).map(source => (
                        <Link key={source.id} href={source.url} target="_blank" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.8rem', fontWeight: 600 }}>
                          {source.label} {source.icon}
                        </Link>
                      ));
                    })()}
                  </Box>
                </Paper>

                {isAdmin && (
                  <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                    <Button 
                      variant="outlined" 
                      size="small" 
                      onClick={handleDeepHistoryScrape} 
                      startIcon={activeTask ? <Activity size={14} className="animate-pulse" /> : <History size={14} />}
                      color={activeTask ? "primary" : "inherit"}
                      sx={{ 
                        flex: 1, 
                        borderRadius: 2, 
                        fontSize: '0.7rem',
                        ...(activeTask && {
                          borderColor: 'primary.main',
                          bgcolor: 'rgba(242, 125, 38, 0.05)',
                          fontWeight: 800
                        })
                      }}
                    >
                      {activeTask ? 'Viewing Progress' : 'Scrape History'}
                    </Button>
                    <Button 
                      variant="outlined" 
                      size="small" 
                      color="error"
                      onClick={() => setBulkDeleteOpen(true)}
                      startIcon={<Trash2 size={14} />}
                      sx={{ flex: 1, borderRadius: 2, fontSize: '0.7rem' }}
                    >
                      Release Notes
                    </Button>
                  </Box>
                )}
              </>
            )}

            <Divider sx={{ mb: 3 }} />
            
            <Typography variant="overline" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
              Release History ({notes.length})
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 'calc(100vh - 400px)', overflowY: 'auto', pr: 1 }}>
              {notes.map((note) => (
                <Paper
                  key={note.id}
                  component={motion.div}
                  whileHover={{ x: 4 }}
                  onClick={() => setSelectedNote(note)}
                  sx={{ 
                    p: 2, 
                    cursor: 'pointer',
                    bgcolor: selectedNote?.id === note.id ? 'rgba(242, 125, 38, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid',
                    borderColor: selectedNote?.id === note.id ? 'primary.main' : 'rgba(255, 255, 255, 0.1)',
                    transition: 'all 0.2s',
                    position: 'relative',
                    '&:hover .delete-btn': { opacity: 1 }
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: "space-between", alignItems: "center" }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                      v{note.version}
                      {note.isVerified && <ShieldCheck size={14} color="#00FF7F" />}
                    </Typography>
                    <Chip 
                      label={note.category} 
                      size="small" 
                      sx={{ 
                        height: 20, 
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        bgcolor: getCategoryColor(note.category).bg,
                        color: getCategoryColor(note.category).text
                      }} 
                    />
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(note.releaseDate).toLocaleDateString()}
                    </Typography>
                    {isAdmin && (
                      <IconButton 
                        className="delete-btn"
                        size="small" 
                        color="error" 
                        sx={{ opacity: 0, p: 0.5 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setNoteToDelete(note.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    )}
                  </Box>
                </Paper>
              ))}
              {notes.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  No release history found.
                </Typography>
              )}
            </Box>
          </Box>
        </Grid>

        {/* Content Area */}
        <Grid size={{ xs: 12, md: 8, lg: 9 }}>
          <AnimatePresence mode="wait">
            {selectedNote ? (
              <Box
                key={selectedNote.id}
                component={motion.div}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                sx={{ bgcolor: 'rgba(255, 255, 255, 0.02)', borderRadius: 4, p: { xs: 3, md: 6 }, border: '1px solid rgba(255, 255, 255, 0.05)' }}
              >
                <Box sx={{ 
                  display: 'flex', 
                  flexDirection: { xs: 'column', sm: 'row' }, 
                  gap: 2, 
                  justifyContent: "space-between", 
                  alignItems: { xs: 'flex-start', sm: 'center' }, 
                  mb: 4 
                }}>
                  <Box>
                    <Typography variant="h3" sx={{ 
                      fontWeight: 900, 
                      color: 'primary.main', 
                      mb: 1,
                      fontSize: { xs: '2rem', sm: '3rem' },
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2
                    }}>
                      v{selectedNote.version}
                      {selectedNote.isVerified && <ShieldCheck size={32} color="#00FF7F" />}
                    </Typography>
                    <Box sx={{ 
                      display: 'flex', 
                      flexWrap: 'wrap',
                      gap: { xs: 1, sm: 2 }, 
                      color: 'text.secondary', 
                      alignItems: 'center' 
                    }}>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: "center" }}>
                        <Calendar size={16} />
                        <Typography variant="body2">{new Date(selectedNote.releaseDate).toLocaleDateString(undefined, { dateStyle: 'long' })}</Typography>
                      </Box>
                      <Divider orientation="vertical" flexItem sx={{ height: 16, display: { xs: 'none', sm: 'block' } }} />
                      <Box sx={{ display: 'flex', gap: 1, alignItems: "center" }}>
                        <Tag size={16} />
                        <Chip 
                          label={selectedNote.category} 
                          size="small"
                          sx={{ 
                            fontWeight: 700,
                            bgcolor: getCategoryColor(selectedNote.category).bg,
                            color: getCategoryColor(selectedNote.category).text,
                            borderRadius: 1
                          }} 
                        />
                      </Box>
                    </Box>
                  </Box>
                  
                  <Box>
                    {isAdmin && (
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button 
                          variant={selectedNote.isVerified ? "contained" : "outlined"} 
                          color="success" 
                          size="small"
                          startIcon={selectedNote.isVerified ? <ShieldCheck size={16} /> : null}
                          onClick={() => toggleVerifyNote(selectedNote.id, selectedNote.isVerified)}
                        >
                          {selectedNote.isVerified ? "Verified" : "Mark as Verified"}
                        </Button>
                        <IconButton color="error" onClick={() => deleteNote(selectedNote.id)}>
                          <Trash2 size={20} />
                        </IconButton>
                      </Box>
                    )}
                  </Box>
                </Box>

                <Box sx={{ 
                  '& h1, & h2, & h3': { color: 'primary.main', mb: 2, mt: 4 },
                  '& p': { color: 'text.secondary', lineHeight: 1.8, mb: 2 },
                  '& ul, & ol': { color: 'text.secondary', pl: 3, mb: 2 },
                  '& li': { mb: 1 },
                  '& code': { bgcolor: 'rgba(255, 255, 255, 0.1)', p: '2px 4px', borderRadius: 1 }
                }}>
                  <Markdown>{selectedNote.summary}</Markdown>
                </Box>

                {selectedNote.rawData && (
                   <Paper variant="outlined" sx={{ mt: 6, p: 3, bgcolor: 'rgba(0,0,0,0.2)' }}>
                    <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Info size={16} /> Raw Log Preview
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                      {selectedNote.rawData.substring(0, 500)}...
                    </Typography>
                   </Paper>
                )}
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', py: 12 }}>
                <History size={64} style={{ opacity: 0.1, marginBottom: 24 }} />
                <Typography color="text.secondary">Select a release from the timeline to view details.</Typography>
              </Box>
            )}
          </AnimatePresence>
        </Grid>
      </Grid>

      <Dialog 
        open={deleteDialogOpen} 
        onClose={() => setDeleteDialogOpen(false)}
        slotProps={{ paper: { sx: { bgcolor: '#1a1a1a', borderRadius: 3, border: '1px solid rgba(255,255,255,0.1)' } } }}
      >
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', gap: 1, alignItems: 'center' }}>
          <AlertTriangle color="#ff4d4d" /> Confirm Product Purge
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'rgba(255,255,255,0.7)' }}>
            Are you absolutely sure you want to delete <b>{software?.name}</b>?
            <br /><br />
            This action is permanent and will delete:
            <ul style={{ marginTop: 8 }}>
              <li>The main registry entry</li>
              <li>ALL historical release notes ({notes.length} items)</li>
              <li>All user tracking and library entries</li>
            </ul>
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} sx={{ color: 'text.secondary' }}>Cancel</Button>
          <Button 
            onClick={performDeleteProduct} 
            variant="contained" 
            color="error"
            sx={{ fontWeight: 700, borderRadius: 2 }}
          >
            Yes, Purge Everything
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: 'error.main', display: 'flex', alignItems: 'center', gap: 1 }}>
          <AlertTriangle size={20} />
          Bulk Note Cleanup
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Delete release notes for <b>{software?.name}</b> based on a date range. Leave empty to select all.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField 
              label="Start Date" 
              type="date" 
              fullWidth 
              size="small"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField 
              label="End Date" 
              type="date" 
              fullWidth 
              size="small"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setBulkDeleteOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={handleBulkDelete} color="error" variant="contained">Execute Wipe</Button>
        </DialogActions>
      </Dialog>

      <Dialog 
        open={Boolean(noteToDelete)} 
        onClose={() => setNoteToDelete(null)}
        slotProps={{ paper: { sx: { bgcolor: '#1a1a1a', borderRadius: 3, border: '1px solid rgba(255,255,255,0.1)' } } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>Delete Release Note?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
            Are you sure you want to remove this specific version log? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setNoteToDelete(null)} sx={{ color: 'text.secondary' }}>Cancel</Button>
          <Button 
            onClick={() => {
              if (noteToDelete) {
                deleteNote(noteToDelete);
                setNoteToDelete(null);
              }
            }} 
            variant="contained" 
            color="error"
          >
            Delete Note
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog 
        open={historyScrapeOpen} 
        onClose={() => setHistoryScrapeOpen(false)}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: {
            sx: { borderRadius: 4, bgcolor: 'background.paper', backgroundImage: 'none' }
          }
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Maintenance & History Scraper
          <IconButton onClick={() => setHistoryScrapeOpen(false)} size="small">
            <X size={20} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <ScrapeHistoryView software={software} onClose={() => setHistoryScrapeOpen(false)} />
        </DialogContent>
      </Dialog>
    </Container>
  );
}
