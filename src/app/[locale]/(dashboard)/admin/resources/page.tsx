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
} from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useTranslations } from "next-intl";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ResourceFile {
  fileName: string;
  url: string;
  key: string;
  contentType: string;
  size: number;
}

interface Resource {
  _id: string;
  title: string;
  description?: string;
  category: string;
  files: ResourceFile[];
  uploadedBy?: { _id: string; name: string };
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CATEGORY_OPTIONS = [
  { value: "all", label: "All Categories" },
  { value: "brochure", label: "Brochure" },
  { value: "banner", label: "Banner" },
  { value: "presentation", label: "Presentation" },
  { value: "document", label: "Document" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "template", label: "Template" },
  { value: "other", label: "Other" },
];

const CATEGORY_FORM_OPTIONS = CATEGORY_OPTIONS.filter((c) => c.value !== "all");

const CATEGORY_ICONS: Record<string, typeof FileText> = {
  brochure: FileText,
  banner: Image,
  presentation: FileText,
  document: FileText,
  image: Image,
  video: Video,
  template: FileText,
  other: FileText,
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPreviewable(contentType: string): boolean {
  return contentType.startsWith("image/") || contentType === "application/pdf";
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
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: "", description: "", category: "other",
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const resetForm = () => {
    setForm({ title: "", description: "", category: "other" });
    setSelectedFiles([]);
    setEditingId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ─── Fetch ─── */
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (search) params.set("search", search);
      params.set("limit", "50");

      const res = await fetch(`/api/resources?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
      }
    } catch {
      toast.error(t("fetchError"));
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, search, t]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  /* ─── Create ─── */
  const handleCreate = async () => {
    if (!form.title.trim()) {
      toast.error(t("titleRequired"));
      return;
    }

    const formData = new FormData();
    formData.append("title", form.title);
    if (form.description) formData.append("description", form.description);
    formData.append("category", form.category);
    for (const file of selectedFiles) {
      formData.append("files", file);
    }

    try {
      const res = await csrfFetch("/api/resources", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        toast.success(t("created"));
        resetForm();
        setShowForm(false);
        fetchItems();
      } else {
        const err = await res.json();
        toast.error(err.error ?? t("createError"));
      }
    } catch {
      toast.error(t("createError"));
    }
  };

  /* ─── Update metadata ─── */
  const handleUpdate = async () => {
    if (!editingId || !form.title.trim()) return;

    const formData = new FormData();
    formData.append("title", form.title);
    if (form.description) formData.append("description", form.description);
    formData.append("category", form.category);
    for (const file of selectedFiles) {
      formData.append("files", file);
    }

    try {
      const res = await csrfFetch(`/api/resources/${editingId}`, {
        method: "PATCH",
        body: formData,
      });

      if (res.ok) {
        toast.success(t("updated"));
        resetForm();
        setShowForm(false);
        fetchItems();
      } else {
        const err = await res.json();
        toast.error(err.error ?? t("updateError"));
      }
    } catch {
      toast.error(t("updateError"));
    }
  };

  /* ─── Delete resource ─── */
  const handleDelete = async (id: string) => {
    try {
      const res = await csrfFetch(`/api/resources/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("deleted"));
        fetchItems();
      }
    } catch {
      toast.error(t("deleteError"));
    }
  };

  /* ─── Remove single file from resource ─── */
  const handleRemoveFile = async (resourceId: string, fileKey: string) => {
    try {
      const res = await csrfFetch(`/api/resources/${resourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeFileKeys: [fileKey] }),
      });
      if (res.ok) {
        toast.success(t("fileRemoved"));
        fetchItems();
      }
    } catch {
      toast.error(t("fileRemoveError"));
    }
  };

  /* ─── Toggle active ─── */
  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await csrfFetch(`/api/resources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      fetchItems();
    } catch {
      toast.error(t("updateError"));
    }
  };

  /* ─── Edit ─── */
  const startEdit = (item: Resource) => {
    setForm({
      title: item.title,
      description: item.description ?? "",
      category: item.category,
    });
    setSelectedFiles([]);
    setEditingId(item._id);
    setShowForm(true);
  };

  const CategoryIcon = (cat: string) => CATEGORY_ICONS[cat] ?? FileText;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FolderOpen className="h-6 w-6" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t("adminSubtitle")}</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          {t("addResource")}
        </Button>
      </div>

      {/* ─── Filters ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <SearchableSelect
          options={CATEGORY_OPTIONS}
          value={categoryFilter}
          onValueChange={setCategoryFilter}
          placeholder={t("filterCategory")}
        />
      </div>

      {/* ─── List ─── */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Clock className="h-5 w-5 animate-spin mr-2" /> {tc("loading")}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Inbox className="h-12 w-12 mb-3 opacity-40" />
          <p>{t("noResources")}</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => {
            const Icon = CategoryIcon(item.category);
            return (
              <div
                key={item._id}
                className={`rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md ${!item.isActive ? "opacity-60" : ""}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Icon className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold text-lg">{item.title}</h3>
                      <Badge variant="outline" className="capitalize">{item.category}</Badge>
                      {!item.isActive && <Badge variant="secondary">{t("inactive")}</Badge>}
                    </div>

                    {item.description && (
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    )}

                    {/* File list */}
                    {item.files.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {item.files.map((file) => (
                          <div
                            key={file.key}
                            className="flex items-center gap-2 rounded border px-2 py-1 text-xs bg-muted/50"
                          >
                            {file.contentType.startsWith("image/") ? (
                              <Image className="h-3 w-3" />
                            ) : file.contentType.startsWith("video/") ? (
                              <Video className="h-3 w-3" />
                            ) : (
                              <FileText className="h-3 w-3" />
                            )}
                            <span className="max-w-[120px] truncate">{file.fileName}</span>
                            <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
                            {isPreviewable(file.contentType) && (
                              <button onClick={() => setPreviewUrl(file.url)} className="hover:text-primary">
                                <Eye className="h-3 w-3" />
                              </button>
                            )}
                            <a href={file.url} download={file.fileName} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
                              <Download className="h-3 w-3" />
                            </a>
                            <button onClick={() => handleRemoveFile(item._id, file.key)} className="hover:text-destructive">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      {t("uploadedBy")}: {item.uploadedBy?.name} · {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => toggleActive(item._id, item.isActive)}>
                      {item.isActive ? t("deactivate") : t("activate")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => startEdit(item)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(item._id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Preview Dialog ─── */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) setPreviewUrl(null); }}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{t("preview")}</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            previewUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)/i) || previewUrl.includes("image") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Preview" className="max-h-[60vh] w-full object-contain" />
            ) : (
              <iframe src={previewUrl} className="w-full h-[60vh]" title="Preview" />
            )
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Create / Edit Dialog ─── */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { resetForm(); setShowForm(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? t("editResource") : t("addResource")}</DialogTitle>
            <DialogDescription>{t("formDescription")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="title">{t("resourceTitle")} *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={t("titlePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t("description")}</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t("descriptionPlaceholder")}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("category")}</Label>
              <SearchableSelect
                options={CATEGORY_FORM_OPTIONS}
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
                placeholder={t("selectCategory")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("files")}</Label>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t("dropFiles")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("maxSize")}</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    setSelectedFiles(Array.from(e.target.files));
                  }
                }}
              />
              {selectedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedFiles.map((f, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {f.name} ({formatFileSize(f.size)})
                      <button onClick={() => setSelectedFiles((prev) => prev.filter((_, j) => j !== i))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setShowForm(false); }}>
              {tc("cancel")}
            </Button>
            <Button onClick={editingId ? handleUpdate : handleCreate}>
              {editingId ? tc("save") : t("upload")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
