"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
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
  FolderOpen, Plus, Trash2, Edit, Search, Inbox,
  FileText, Image, Video, Upload, Download, Eye,
  Tag, Shield, History, BarChart2, Save, Users,
  Package, Activity,
} from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useTranslations } from "next-intl";
import { formatDate, formatDateTime } from "@/lib/ui/intlFormat";

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

// Category labels are resolved inside component with i18n
// Access levels are resolved inside component with i18n
// Sort options are resolved inside component with i18n

const ACCESS_COLORS: Record<string, string> = {
  all_staff: "ring-emerald-200 bg-emerald-50/80 text-emerald-700",
  agent: "ring-sky-200 bg-sky-50/80 text-sky-700",
  super_agent: "ring-violet-200 bg-violet-50/80 text-violet-700",
  admin: "ring-rose-200 bg-rose-50/80 text-rose-700",
};

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
  const [customCategories, setCustomCategories] = useState<Array<{value: string; label: string}>>([]);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Build localized options
  const categoryLabels = {
    standee_designs: t("categories.standee_designs"),
    brochures: t("categories.brochures"),
    flyers: t("categories.flyers"),
    employer_kits: t("categories.employer_kits"),
    candidate_forms: t("categories.candidate_forms"),
    booth_designs: t("categories.booth_designs"),
    presentation_decks: t("categories.presentation_decks"),
    exhibition_videos: t("categories.exhibition_videos"),
    contracts: t("categories.contracts"),
    vendor_documents: t("categories.vendor_documents"),
    travel_templates: t("categories.travel_templates"),
    branding_assets: t("categories.branding_assets"),
    compliance_docs: t("categories.compliance_docs"),
    other: t("categories.other"),
  };
  const defaultCategoryOptions = Object.entries(categoryLabels).map(([v, l]) => ({ value: v, label: l }));
  const allCategoryOptions = [...defaultCategoryOptions, ...customCategories];
  const filterCategoryOptions = [{ value: "all", label: t("categories.all") }, ...allCategoryOptions];
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<Resource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formDialogContainer, setFormDialogContainer] = useState<HTMLDivElement | null>(null);
  const setFormDialogRef = useCallback((node: HTMLDivElement | null) => { setFormDialogContainer(node); }, []);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCategory, setFormCategory] = useState("brochures");
  const [formAccessLevel, setFormAccessLevel] = useState("all_staff");
  const [formTags, setFormTags] = useState("");
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [formVersionNotes, setFormVersionNotes] = useState("");
  const [downloadLogs, setDownloadLogs] = useState<Array<{ _id: string; userId?: { name?: string; email?: string }; fileName: string; downloadedAt: string }>>([]);
  const [showDownloads, setShowDownloads] = useState<string | null>(null);

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
    setFormTags(item.tags?.join(", ") ?? ""); setFormFiles([]); setFormVersionNotes("");
    setShowForm(true);
  };

  const handleCreate = async () => {
    if (!formTitle.trim()) { toast.error(t("titleRequired")); return; }
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
    } catch { toast.error(t("createError")); }
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
    } catch { toast.error(t("updateError")); }
  };

  const handleDelete = async (id: string) => {
    try { const res = await csrfFetch(`/api/resources/${id}`, { method: "DELETE" }); if (res.ok) { toast.success(t("deleted")); fetchItems(); } } catch { toast.error(t("deleteError")); }
  };

  const handleDownloadTrack = async (item: Resource, file: ResourceFile) => {
    try {
      await csrfFetch(`/api/resources/${item._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileKey: file.key, fileName: file.fileName }),
      });
    } catch { /* ignore */ }
    window.open(file.url, "_blank");
  };

  const fetchDownloadLogs = async (resourceId: string) => {
    try {
      const res = await fetch(`/api/resources/${resourceId}/downloads?limit=50`);
      if (res.ok) { const data = await res.json(); setDownloadLogs(data.items ?? []); }
    } catch { setDownloadLogs([]); }
    setShowDownloads(resourceId);
  };

  // Stats
  const totalDownloads = items.reduce((s, i) => s + (i.downloadCount ?? 0), 0);
  const categoryCounts = items.reduce<Record<string, number>>((acc, i) => { acc[i.category] = (acc[i.category] ?? 0) + 1; return acc; }, {});

  // Build localized sort options and access levels
  const sortOptions = [
    { value: "newest", label: t("sortNewestFirst") },
    { value: "popular", label: t("sortMostDownloaded") },
    { value: "a-z", label: t("sortAZ") },
  ];

  const localizedAccessLevels = [
    { value: "all_staff", label: t("accessAllStaff") },
    { value: "agent", label: t("accessAgentsOnly") },
    { value: "super_agent", label: t("accessSuperAgentsAdmin") },
    { value: "admin", label: t("accessAdminOnly") },
  ];

  return (
    <div className="page-container">
      <DashboardPageHeader
        compact
        icon={FolderOpen}
        title={t("title")}
        description={t("adminSubtitle")}
        compactOnMobile
        actions={
          <Button onClick={() => { resetForm(); setShowForm(true); }} size="sm">
            <Plus className="h-4 w-4 mr-2" /> {t("addResource")}
          </Button>
        }
        metrics={[
          { label: t("metricTotalResources"), value: items.length, icon: Package, iconClassName: "text-sky-600", iconSurfaceClassName: "bg-sky-50" },
          { label: t("metricTotalDownloads"), value: totalDownloads, icon: Download, iconClassName: "text-blue-600", iconSurfaceClassName: "bg-blue-50" },
        ]}
        footer={
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9 text-sm" />
            </div>
            <SearchableSelect options={filterCategoryOptions} value={categoryFilter} onValueChange={setCategoryFilter} placeholder={t("categories.all")} />
            <SearchableSelect options={sortOptions} value={sortBy} onValueChange={setSortBy} placeholder={t("sortByPlaceholder")} />
            {categoryFilter !== "all" && (
              <button onClick={() => setCategoryFilter("all")} className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground">{tc("clear")}</button>
            )}
          </div>
        }
      />

      {/* Resource Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (<div key={i} className="h-48 animate-pulse rounded-2xl bg-background/70" />))}
        </div>
      ) : items.length === 0 ? (
        <section className="workspace-panel-surface rounded-3xl p-10 sm:p-14 text-center">
          <div className="flex flex-col items-center">
            <div className="workspace-glass-panel card-pad rounded-2xl mb-5">
              <Inbox className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="heading-subsection font-semibold text-foreground">{t("noResources")}</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm">{t("noResourcesHint")}</p>
            <Button onClick={() => { resetForm(); setShowForm(true); }} variant="outline" className="mt-6 gap-2">
              <Plus className="h-4 w-4" /> {t("addResource")}
            </Button>
          </div>
        </section>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => {
            const CatIcon = item.files?.[0]?.contentType?.startsWith("video/") ? Video : item.files?.[0]?.contentType?.startsWith("image/") ? Image : FileText;
            return (
              <article key={item._id} className="workspace-glass-panel rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_50px_-38px_rgba(2,132,199,0.38)]">
                <div className="card-pad space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="rounded-2xl ring-1 ring-inset ring-border/60 bg-background/80 shrink-0 chip-pad">
                        <CatIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <button onClick={() => setDetailItem(item)} className="text-[15px] font-semibold text-foreground text-left hover:text-primary transition-colors truncate block max-w-full">{item.title}</button>
                        <p className="text-xs text-muted-foreground mt-0.5">{categoryLabels[item.category as keyof typeof categoryLabels] ?? item.category}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${ACCESS_COLORS[item.accessLevel] ?? ACCESS_COLORS.all_staff}`}>
                      <Shield className="h-2.5 w-2.5" />
                      {item.accessLevel === "all_staff" ? "All" : item.accessLevel === "super_agent" ? "SA" : item.accessLevel}
                    </span>
                  </div>

                  {item.description && <p className="text-sm leading-6 text-muted-foreground line-clamp-2">{item.description}</p>}

                  {item.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {item.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-0.5 rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-xs font-medium text-muted-foreground"><Tag className="h-2.5 w-2.5" />{tag}</span>
                      ))}
                      {item.tags.length > 3 && <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-xs font-medium text-muted-foreground">+{item.tags.length - 3}</span>}
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><Download className="h-3.5 w-3.5" /> {item.downloadCount ?? 0}</span>
                    <span className="flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> v{item.version ?? 1}</span>
                    <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> {item.files?.length ?? 0}</span>
                  </div>

                  {item.files?.slice(0, 2).map((f) => (
                    <div key={f.key} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/60 text-xs chip-pad">
                      <span className="truncate font-medium text-foreground">{f.fileName}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-muted-foreground text-xs">{formatFileSize(f.size)}</span>
                        {f.contentType?.startsWith("image/") && (
                          <button onClick={() => setPreviewUrl(f.url)} className="p-1 rounded-lg hover:bg-card transition-colors"><Eye className="h-3.5 w-3.5 text-muted-foreground" /></button>
                        )}
                        <button onClick={() => handleDownloadTrack(item, f)} className="p-1 rounded-lg hover:bg-card transition-colors"><Download className="h-3.5 w-3.5 text-primary" /></button>
                      </div>
                    </div>
                  ))}
                  {(item.files?.length ?? 0) > 2 && <p className="text-xs text-muted-foreground text-center font-medium">+{item.files.length - 2} more files</p>}

                  <div className="flex items-center gap-1.5 pt-3 border-t border-border/40">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(item)} className="flex-1 h-8 text-xs"><Edit className="h-3.5 w-3.5 mr-1.5" /> {t("editResource")}</Button>
                    <Button variant="ghost" size="sm" onClick={() => fetchDownloadLogs(item._id)} className="h-8 w-8 p-0" title={t("a11yDownloadHistory")}><Users className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="dense" className="w-8 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(item._id)} title={t("a11yDelete")}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!detailItem} onOpenChange={() => setDetailItem(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detailItem && (<>
            <DialogHeader>
              <DialogTitle className="text-xl">{detailItem.title}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 pt-2">
                <Badge variant="outline" className="text-xs">{categoryLabels[detailItem.category as keyof typeof categoryLabels] ?? detailItem.category}</Badge>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${ACCESS_COLORS[detailItem.accessLevel]}`}>
                  <Shield className="h-2.5 w-2.5" />{detailItem.accessLevel}
                </span>
                <span className="text-xs text-muted-foreground">v{detailItem.version}</span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 text-sm">
              {detailItem.description && <p className="text-muted-foreground leading-relaxed">{detailItem.description}</p>}
              {detailItem.tags?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">{detailItem.tags.map((tag) => (<Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>))}</div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div className="workspace-glass-panel card-pad rounded-2xl text-center"><p className="text-xl font-semibold text-foreground">{detailItem.downloadCount}</p><p className="text-xs text-muted-foreground font-medium mt-0.5">Downloads</p></div>
                <div className="workspace-glass-panel card-pad rounded-2xl text-center"><p className="text-xl font-semibold text-foreground">{detailItem.files?.length}</p><p className="text-xs text-muted-foreground font-medium mt-0.5">Files</p></div>
                <div className="workspace-glass-panel card-pad rounded-2xl text-center"><p className="text-xl font-semibold text-foreground">{detailItem.version}</p><p className="text-xs text-muted-foreground font-medium mt-0.5">Version</p></div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">Files</p>
                <div className="space-y-2">
                  {detailItem.files?.map((f) => (
                    <div key={f.key} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 chip-pad">
                      <span className="truncate text-xs font-medium">{f.fileName} <span className="text-muted-foreground">({formatFileSize(f.size)})</span></span>
                      <Button variant="outline" size="sm" onClick={() => handleDownloadTrack(detailItem, f)} className="h-7 text-xs shrink-0"><Download className="h-3 w-3 mr-1" /> {t("download")}</Button>
                    </div>
                  ))}
                </div>
              </div>
              {detailItem.versionHistory?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">{t("versionHistoryTitle")}</p>
                  <div className="space-y-1.5">{detailItem.versionHistory.map((v, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs border-l-2 border-primary/30 pl-3 py-1.5">
                      <Badge variant="outline" className="text-xs shrink-0">v{v.version}</Badge>
                      <span className="text-muted-foreground">{formatDateTime(new Date(v.uploadedAt))}</span>
                      {v.notes && <span className="italic text-muted-foreground">{v.notes}</span>}
                    </div>
                  ))}</div>
                </div>
              )}
              <p className="text-xs text-muted-foreground pt-2 border-t">{t("uploadedBy")} {detailItem.uploadedBy?.name} &middot; {formatDate(new Date(detailItem.createdAt))}</p>
            </div>
            <DialogFooter><Button variant="ghost" onClick={() => setDetailItem(null)}>{tc("close")}</Button></DialogFooter>
          </>)}
        </DialogContent>
      </Dialog>

      {/* File Preview */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader><DialogTitle>{t("previewTitle")}</DialogTitle></DialogHeader>
          {previewUrl && (
            previewUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)/i)
              ? <img src={previewUrl} alt="Preview" className="max-h-[65vh] w-full object-contain rounded-lg" />
              : <embed src={previewUrl} type="application/pdf" className="w-full h-[65vh] rounded-lg" />
          )}
          <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => window.open(previewUrl!, '_blank')}>{t("openInNewTab")}</Button></div>
        </DialogContent>
      </Dialog>

      {/* Download Log Modal */}
      <Dialog open={!!showDownloads} onOpenChange={() => setShowDownloads(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> {t("downloadHistoryTitle")}</DialogTitle>
            <DialogDescription>{t("downloadHistoryDesc")}</DialogDescription>
          </DialogHeader>
          {downloadLogs.length === 0 ? (
            <div className="flex flex-col items-center py-8">
              <div className="workspace-glass-panel card-pad rounded-2xl mb-3"><Download className="h-5 w-5 text-muted-foreground/50" /></div>
              <p className="text-sm text-muted-foreground">{t("noDownloadsRecorded")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {downloadLogs.map((log) => (
                <div key={log._id} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 text-xs chip-pad">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{log.userId?.name ?? "Unknown user"}</p>
                    {log.userId?.email && <p className="text-muted-foreground truncate">{log.userId.email}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-muted-foreground font-medium">{log.fileName}</p>
                    <p className="text-muted-foreground text-xs">{formatDateTime(new Date(log.downloadedAt))}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setShowDownloads(null)}>{tc("close")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Modal */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent ref={setFormDialogRef} className="flex max-h-[calc(100dvh-2rem)] w-[min(96vw,36rem)] max-w-2xl flex-col overflow-hidden p-0">
          <div className="shrink-0 border-b px-6 pb-4 pt-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5 text-lg">
                <div className="rounded-2xl p-2 ring-1 ring-inset ring-primary/20 bg-primary/5">
                  {editingId ? <Edit className="h-4 w-4 text-primary" /> : <Upload className="h-4 w-4 text-primary" />}
                </div>
                {editingId ? t("editResourceTitle") : t("addNewResourceTitle")}
              </DialogTitle>
              <DialogDescription className="mt-1.5 ml-[44px]">
                {editingId ? t("editResourceSubtitle") : t("addNewResourceSubtitle")}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-5">
              <div className="field">
                <Label className="text-sm font-medium">{t("resourceTitle")} <span className="text-destructive">*</span></Label>
                <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder={t("titlePlaceholder")} className="h-10" />
              </div>
              <div className="field">
                <Label className="text-sm font-medium">{t("description")}</Label>
                <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder={t("descriptionPlaceholder")} rows={3} className="resize-none" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="field">
                  <Label className="text-sm font-medium">{t("category")}</Label>
                  {showNewCategory ? (
                    <div className="flex gap-2">
                      <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="New category name..." className="h-10 flex-1" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const slug = newCategoryName.trim().toLowerCase().replace(/\s+/g, '_'); if (slug && !allCategoryOptions.find(c => c.value === slug)) { setCustomCategories(prev => [...prev, { value: slug, label: newCategoryName.trim() }]); setFormCategory(slug); } setNewCategoryName(''); setShowNewCategory(false); }}} />
                      <Button type="button" size="sm" className="h-10 px-3" onClick={() => { const slug = newCategoryName.trim().toLowerCase().replace(/\s+/g, '_'); if (slug && !allCategoryOptions.find(c => c.value === slug)) { setCustomCategories(prev => [...prev, { value: slug, label: newCategoryName.trim() }]); setFormCategory(slug); } setNewCategoryName(''); setShowNewCategory(false); }}><Plus className="h-4 w-4" /></Button>
                      <Button type="button" variant="ghost" size="sm" className="h-10 px-3" onClick={() => { setShowNewCategory(false); setNewCategoryName(''); }}>&#x2715;</Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <div className="flex-1"><SearchableSelect options={allCategoryOptions} value={formCategory} onValueChange={setFormCategory} placeholder={t("selectCategory")} container={formDialogContainer} modal /></div>
                      <Button type="button" variant="outline" size="sm" className="h-10 px-3 shrink-0" onClick={() => setShowNewCategory(true)} title={t("a11yAddNewCategory")}><Plus className="h-4 w-4" /></Button>
                    </div>
                  )}
                </div>
                <div className="field">
                  <Label className="text-sm font-medium">{t("accessLevelLabel")}</Label>
                  <SearchableSelect options={localizedAccessLevels} value={formAccessLevel} onValueChange={setFormAccessLevel} placeholder={t("whoCanAccessPlaceholder")} container={formDialogContainer} modal />
                </div>
              </div>
              <div className="field">
                <Label className="text-sm font-medium">{t("tags")}</Label>
                <Input value={formTags} onChange={(e) => setFormTags(e.target.value)} placeholder={t("tagsPlaceholder")} className="h-10" />
                <p className="text-xs text-muted-foreground">{t("tagsHelperText")}</p>
              </div>
              {editingId && (
                <div className="field">
                  <Label className="text-sm font-medium">{t("versionNotesLabel")}</Label>
                  <Input value={formVersionNotes} onChange={(e) => setFormVersionNotes(e.target.value)} placeholder={t("versionNotesPlaceholder")} className="h-10" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t("files")}</Label>
                <div className="cursor-pointer rounded-2xl border-2 border-dashed border-border/60 p-8 text-center transition-all hover:border-primary/40 hover:bg-primary/5" onClick={() => fileInputRef.current?.click()}>
                  <div className="flex flex-col items-center gap-2">
                    <div className="rounded-2xl bg-primary/10 p-3"><Upload className="h-5 w-5 text-primary" /></div>
                    {formFiles.length > 0 ? (
                      <>
                        <p className="text-sm font-semibold">{formFiles.length} file{formFiles.length > 1 ? "s" : ""} selected</p>
                        <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                          {formFiles.slice(0, 3).map((f, i) => (<Badge key={i} variant="secondary" className="max-w-full break-all text-xs">{f.name}</Badge>))}
                          {formFiles.length > 3 && <Badge variant="secondary" className="text-xs">+{formFiles.length - 3} more</Badge>}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold">{t("filesUploadDescription")}</p>
                        <p className="text-xs text-muted-foreground">{t("dragDropText")}</p>
                      </>
                    )}
                  </div>
                </div>
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => setFormFiles(Array.from(e.target.files ?? []))} />
              </div>
            </div>
          </div>

          <div className="shrink-0 flex items-center justify-end gap-3 border-t px-6 py-4">
            <Button variant="outline" onClick={resetForm}>{tc("cancel")}</Button>
            <Button onClick={editingId ? handleUpdate : handleCreate} className="min-w-[100px]">
              {editingId ? (<><Save className="h-4 w-4 mr-2" /> {tc("save")}</>) : (<><Upload className="h-4 w-4 mr-2" /> {t("uploadButtonLabel")}</>)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
