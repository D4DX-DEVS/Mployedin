"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  FolderOpen, Plus, Clock, Trash2, Edit, Search, Inbox,
  FileText, Image, Video, Upload, Download, Eye, X,
  Tag, Shield, History, TrendingUp, BarChart2,
} from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useTranslations } from "next-intl";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ResourceFile { fileName: string; url: string; key: string; contentType: string; size: number; }
interface VersionEntry { version: number; uploadedBy?: string; uploadedAt: string; notes?: string; }

interface Resource {
  _id: string;
  title: string;
  description?: string;
  category: string;
  tags: string[];
  accessLevel: string;
  version: number;
  versionHistory: VersionEntry[];
  downloadCount: number;
  files: ResourceFile[];
  uploadedBy?: { _id: string; name: string };
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CATEGORY_LABELS: Record<string, string> = {
  standee_designs: "Standee Designs", brochures: "Brochures", flyers: "Flyers",
  employer_kits: "Employer Kits", candidate_forms: "Candidate Forms", booth_designs: "Booth Designs",
  presentation_decks: "Presentation Decks", exhibition_videos: "Exhibition Videos",
  contracts: "Contracts", vendor_documents: "Vendor Documents", travel_templates: "Travel Templates",
  branding_assets: "Branding Assets", compliance_docs: "Compliance Docs", other: "Other",
};

const CATEGORY_OPTIONS = [{ value: "all", label: "All Categories" }, ...Object.entries(CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l }))];
const CATEGORY_FORM_OPTIONS = CATEGORY_OPTIONS.filter((c) => c.value !== "all");

const ACCESS_LEVELS = [
  { value: "all_staff", label: "All Staff" },
  { value: "agent", label: "Agents Only" },
  { value: "super_agent", label: "Super Agents & Admin" },
  { value: "admin", label: "Admin Only" },
];

const ACCESS_COLORS: Record<string, string> = {
  all_staff: "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400",
  agent: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  super_agent: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400",
  admin: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
};

const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "popular", label: "Most Downloaded" },
  { value: "a-z", label: "A â†’ Z" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminResourcesPage() {
  const t = useTranslations("resources");
  const tc = useTranslations("common");

  const [items, setItems] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<Resource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCategory, setFormCategory] = useState("brochures");
  const [formAccessLevel, setFormAccessLevel] = useState("all_staff");
  const [formTags, setFormTags] = useState("");
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [formVersionNotes, setFormVersionNotes] = useState("");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort: sortBy });
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/resources?${params}`);
      if (res.ok) { const data = await res.json(); setItems(data.items ?? []); }
    } catch { toast.error(t("fetchError")); } finally { setLoading(false); }
  }, [categoryFilter, sortBy, search, t]);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  const resetForm = () => {
    setFormTitle(""); setFormDesc(""); setFormCategory("brochures"); setFormAccessLevel("all_staff");
    setFormTags(""); setFormFiles([]); setFormVersionNotes(""); setEditingId(null); setShowForm(false);
  };

  const openEdit = (item: Resource) => {
    setEditingId(item._id); setFormTitle(item.title); setFormDesc(item.description ?? "");
    setFormCategory(item.category); setFormAccessLevel(item.accessLevel ?? "all_staff");
    setFormTags(item.tags?.join(", ") ?? ""); setFormFiles([]); setFormVersionNotes(""); setShowForm(true);
  };

  const handleCreate = async () => {
    if (!formTitle.trim()) { toast.error("Title is required"); return; }
    try {
      const fd = new FormData();
      fd.append("title", formTitle.trim()); fd.append("category", formCategory);
      fd.append("accessLevel", formAccessLevel);
      if (formDesc.trim()) fd.append("description", formDesc.trim());
      if (formTags.trim()) fd.append("tags", formTags.trim());
      formFiles.forEach((f) => fd.append("files", f));
      const res = await csrfFetch("/api/resources", { method: "POST", body: fd });
      if (res.ok) { toast.success(t("created")); resetForm(); fetchItems(); }
      else { const err = await res.json(); toast.error(err.error ?? "Failed"); }
    } catch { toast.error("Failed to create resource"); }
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    try {
      const fd = new FormData();
      fd.append("title", formTitle.trim()); fd.append("category", formCategory);
      fd.append("accessLevel", formAccessLevel);
      if (formDesc.trim()) fd.append("description", formDesc.trim());
      if (formTags.trim()) fd.append("tags", formTags.trim());
      if (formVersionNotes.trim()) fd.append("versionNotes", formVersionNotes.trim());
      formFiles.forEach((f) => fd.append("files", f));
      const res = await csrfFetch(`/api/resources/${editingId}`, { method: "PATCH", body: fd });
      if (res.ok) { toast.success(t("updated")); resetForm(); fetchItems(); }
      else { const err = await res.json(); toast.error(err.error ?? "Failed"); }
    } catch { toast.error("Failed to update resource"); }
  };

  const handleDelete = async (id: string) => {
    try { const res = await csrfFetch(`/api/resources/${id}`, { method: "DELETE" }); if (res.ok) { toast.success(t("deleted")); fetchItems(); } } catch { toast.error("Failed to delete"); }
  };

  const handleDownloadTrack = async (item: Resource, file: ResourceFile) => {
    try { await csrfFetch(`/api/resources/${item._id}`, { method: "POST" }); } catch { /* ignore */ }
    window.open(file.url, "_blank");
  };

  // Stats
  const totalDownloads = items.reduce((s, i) => s + (i.downloadCount ?? 0), 0);
  const categoryCounts = items.reduce<Record<string, number>>((acc, i) => { acc[i.category] = (acc[i.category] ?? 0) + 1; return acc; }, {});
  const topCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FolderOpen className="h-6 w-6 text-primary" /> Resource Management Center</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage exhibition materials, documents, templates & branding assets</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}><Plus className="h-4 w-4 mr-2" /> Add Resource</Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-card p-4"><p className="text-2xl font-bold">{items.length}</p><p className="text-xs text-muted-foreground">Total Resources</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-2xl font-bold text-blue-600">{totalDownloads}</p><p className="text-xs text-muted-foreground">Total Downloads</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-2xl font-bold text-purple-600">{Object.keys(categoryCounts).length}</p><p className="text-xs text-muted-foreground">Categories Used</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-2xl font-bold text-emerald-600">{items.filter((i) => i.isActive).length}</p><p className="text-xs text-muted-foreground">Active Resources</p></div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search resources..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <SearchableSelect options={CATEGORY_OPTIONS} value={categoryFilter} onValueChange={setCategoryFilter} placeholder="Category" />
        <SearchableSelect options={SORT_OPTIONS} value={sortBy} onValueChange={setSortBy} placeholder="Sort" />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Clock className="h-5 w-5 animate-spin mr-2" /> {tc("loading")}</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground"><Inbox className="h-12 w-12 mb-3 opacity-40" /><p>No resources found</p></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => {
            const CatIcon = item.files?.[0]?.contentType?.startsWith("video/") ? Video : item.files?.[0]?.contentType?.startsWith("image/") ? Image : FileText;
            return (
              <div key={item._id} className="group rounded-xl border bg-card hover:shadow-md transition-shadow overflow-hidden">
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CatIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <button onClick={() => setDetailItem(item)} className="font-semibold text-sm text-left hover:text-primary hover:underline truncate block">{item.title}</button>
                        <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[item.category] ?? item.category}</p>
                      </div>
                    </div>
                    <Badge className={ACCESS_COLORS[item.accessLevel] ?? ACCESS_COLORS.all_staff} title="Access Level">
                      <Shield className="h-3 w-3 mr-1" />{item.accessLevel === "all_staff" ? "All" : item.accessLevel}
                    </Badge>
                  </div>

                  {item.description && <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>}

                  {item.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1">{item.tags.slice(0, 4).map((tag) => (<Badge key={tag} variant="outline" className="text-xs"><Tag className="h-2.5 w-2.5 mr-0.5" />{tag}</Badge>))}{item.tags.length > 4 && <Badge variant="outline" className="text-xs">+{item.tags.length - 4}</Badge>}</div>
                  )}

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Download className="h-3 w-3" /> {item.downloadCount ?? 0}</span>
                    <span className="flex items-center gap-1"><History className="h-3 w-3" /> v{item.version ?? 1}</span>
                    <span>{item.files?.length ?? 0} file{(item.files?.length ?? 0) !== 1 ? "s" : ""}</span>
                  </div>

                  {/* File list (first 2) */}
                  {item.files?.slice(0, 2).map((f) => (
                    <div key={f.key} className="flex items-center justify-between gap-2 rounded border p-2 text-xs">
                      <span className="truncate">{f.fileName}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-muted-foreground">{formatFileSize(f.size)}</span>
                        {f.contentType?.startsWith("image/") && <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setPreviewUrl(f.url)}><Eye className="h-3 w-3" /></Button>}
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleDownloadTrack(item, f)}><Download className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  ))}
                  {(item.files?.length ?? 0) > 2 && <p className="text-xs text-muted-foreground text-center">+{item.files.length - 2} more files</p>}

                  <div className="flex items-center gap-1 pt-1 border-t">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(item)} className="flex-1"><Edit className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(item._id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!detailItem} onOpenChange={() => setDetailItem(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detailItem && (<>
            <DialogHeader>
              <DialogTitle>{detailItem.title}</DialogTitle>
              <DialogDescription className="flex items-center gap-2">
                <Badge variant="outline">{CATEGORY_LABELS[detailItem.category]}</Badge>
                <Badge className={ACCESS_COLORS[detailItem.accessLevel]}><Shield className="h-3 w-3 mr-1" />{detailItem.accessLevel}</Badge>
                <span className="text-xs">v{detailItem.version}</span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              {detailItem.description && <p>{detailItem.description}</p>}
              {detailItem.tags?.length > 0 && (<div><p className="text-muted-foreground mb-1 text-xs font-medium">Tags:</p><div className="flex flex-wrap gap-1">{detailItem.tags.map((tag) => (<Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>))}</div></div>)}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded border p-2 text-center"><p className="text-lg font-bold text-blue-600">{detailItem.downloadCount}</p><p className="text-xs text-muted-foreground">Downloads</p></div>
                <div className="rounded border p-2 text-center"><p className="text-lg font-bold">{detailItem.files?.length}</p><p className="text-xs text-muted-foreground">Files</p></div>
                <div className="rounded border p-2 text-center"><p className="text-lg font-bold">{detailItem.version}</p><p className="text-xs text-muted-foreground">Version</p></div>
              </div>
              <div><p className="text-muted-foreground text-xs font-medium mb-1">Files:</p>{detailItem.files?.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-2 rounded border p-2 mb-1">
                  <span className="truncate text-xs">{f.fileName} ({formatFileSize(f.size)})</span>
                  <Button variant="outline" size="sm" onClick={() => handleDownloadTrack(detailItem, f)}><Download className="h-3 w-3 mr-1" /> Download</Button>
                </div>
              ))}</div>
              {detailItem.versionHistory?.length > 0 && (
                <div><p className="text-muted-foreground text-xs font-medium mb-1">Version History:</p>
                  <div className="space-y-1">{detailItem.versionHistory.map((v, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs border-l-2 border-muted pl-3 py-1">
                      <Badge variant="outline" className="text-xs">v{v.version}</Badge>
                      <span className="text-muted-foreground">{new Date(v.uploadedAt).toLocaleString()}</span>
                      {v.notes && <span className="italic">â€” {v.notes}</span>}
                    </div>
                  ))}</div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Uploaded by {detailItem.uploadedBy?.name} Â· {new Date(detailItem.createdAt).toLocaleDateString()}</p>
            </div>
            <DialogFooter><Button variant="ghost" onClick={() => setDetailItem(null)}>{tc("close")}</Button></DialogFooter>
          </>)}
        </DialogContent>
      </Dialog>

      {/* Image Preview */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl"><img src={previewUrl ?? ""} alt="Preview" className="w-full rounded" /></DialogContent>
      </Dialog>

      {/* Create/Edit Modal */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Resource" : "Add Resource"}</DialogTitle>
            <DialogDescription>{editingId ? "Update resource details, tags & access" : "Upload new exhibition material"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Title *</Label><Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Resource title" /></div>
            <div><Label>Description</Label><Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Brief description..." rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label><SearchableSelect options={CATEGORY_FORM_OPTIONS} value={formCategory} onValueChange={setFormCategory} placeholder="Category" /></div>
              <div><Label>Access Level</Label><SearchableSelect options={ACCESS_LEVELS} value={formAccessLevel} onValueChange={setFormAccessLevel} placeholder="Access" /></div>
            </div>
            <div><Label>Tags (comma-separated)</Label><Input value={formTags} onChange={(e) => setFormTags(e.target.value)} placeholder="e.g. gcc, 2024, branding" /></div>
            {editingId && <div><Label>Version Notes</Label><Input value={formVersionNotes} onChange={(e) => setFormVersionNotes(e.target.value)} placeholder="What changed in this version..." /></div>}
            <div>
              <Label>Files</Label>
              <div className="mt-1 border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/30 transition" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">{formFiles.length > 0 ? `${formFiles.length} file(s) selected` : "Click to upload files"}</p>
              </div>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => setFormFiles(Array.from(e.target.files ?? []))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={resetForm}>{tc("cancel")}</Button>
            <Button onClick={editingId ? handleUpdate : handleCreate}>{editingId ? tc("save") : "Upload"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

