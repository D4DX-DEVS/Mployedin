"use client";

import { useState, useCallback, useRef } from "react";
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
import { FolderOpen, Plus, Edit, Upload, Download, Save, Users, Package } from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/hooks/useConfirm";
import { formatDateTime } from "@/lib/ui/intlFormat";
import { ResourceLibrary } from "@/components/features/resources/ResourceLibrary";
import type { Resource } from "@/components/features/resources/types";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Admin resources: the same library agents and super agents browse (shared
 * cards, inline filters, detail panel), plus Add / Edit / Delete, who can see
 * each resource, and its download history (client feedback 2026-10-15).
 */
export default function AdminResourcesPage() {
  const t = useTranslations("resources");
  const tc = useTranslations("common");
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const [reloadKey, setReloadKey] = useState(0);
  const [summary, setSummary] = useState({ total: 0, downloads: 0 });
  const reload = () => setReloadKey((key) => key + 1);

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
  const categoryOptions = Object.entries(categoryLabels).map(([v, l]) => ({ value: v, label: l }));
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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
      if (res.ok) { toast.success(t("created")); resetForm(); reload(); }
      else { const err = await res.json(); toast.error(err.error ?? t("actionFailed")); }
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
      if (res.ok) { toast.success(t("updated")); resetForm(); reload(); }
      else { const err = await res.json(); toast.error(err.error ?? t("actionFailed")); }
    } catch { toast.error(t("updateError")); }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: t("deleteConfirm"), confirmLabel: tc("delete") });
    if (!ok) return;
    try {
      const res = await csrfFetch(`/api/resources/${id}`, { method: "DELETE" });
      if (res.ok) { toast.success(t("deleted")); reload(); }
      else { toast.error(t("actionFailed")); }
    } catch { toast.error(t("deleteError")); }
  };

  const fetchDownloadLogs = async (resourceId: string) => {
    try {
      const res = await fetch(`/api/resources/${resourceId}/downloads?limit=50`);
      if (res.ok) { const data = await res.json(); setDownloadLogs(data.items ?? []); }
    } catch { setDownloadLogs([]); }
    setShowDownloads(resourceId);
  };

  const localizedAccessLevels = [
    { value: "all_staff", label: t("accessAllStaff") },
    { value: "agent", label: t("accessAgentsOnly") },
    { value: "super_agent", label: t("accessSuperAgentsAdmin") },
    { value: "admin", label: t("accessAdminOnly") },
  ];

  return (
    <div className="page-container">
      {ConfirmDialogNode}

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
          { label: t("metricTotalResources"), value: summary.total, icon: Package, iconClassName: "text-sky-600", iconSurfaceClassName: "bg-sky-50" },
          { label: t("metricTotalDownloads"), value: summary.downloads, icon: Download, iconClassName: "text-blue-600", iconSurfaceClassName: "bg-blue-50" },
        ]}
      />

      <ResourceLibrary
        reloadKey={reloadKey}
        onSummary={setSummary}
        manage={{
          accessLabel: (level) => localizedAccessLevels.find((option) => option.value === level)?.label ?? level,
          onEdit: (item) => openEdit(item),
          onDelete: (item) => void handleDelete(item._id),
          onHistory: (item) => void fetchDownloadLogs(item._id),
          emptyAction: (
            <Button onClick={() => { resetForm(); setShowForm(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> {t("addResource")}
            </Button>
          ),
        }}
      />

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
                  {/* A fixed list: Resource.category is an enum, and exhibition
                      resource matching maps onto these values. The old "+"
                      invented categories the API then rejected. */}
                  <SearchableSelect options={categoryOptions} value={formCategory} onValueChange={setFormCategory} placeholder={t("selectCategory")} container={formDialogContainer} modal />
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
                        <p className="text-sm font-semibold">{t("filesSelected", { count: formFiles.length })}</p>
                        <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                          {formFiles.slice(0, 3).map((f, i) => (<Badge key={i} variant="secondary" className="max-w-full break-all text-xs">{f.name}</Badge>))}
                          {formFiles.length > 3 && <Badge variant="secondary" className="text-xs">{t("moreItems", { count: formFiles.length - 3 })}</Badge>}
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
