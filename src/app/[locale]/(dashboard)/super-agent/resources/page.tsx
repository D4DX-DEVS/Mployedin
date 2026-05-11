"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  FolderOpen, Clock, Search, Inbox, FileText, Image, Video,
  Download, Eye,
} from "lucide-react";
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

export default function ResourceDownloadsPage() {
  const t = useTranslations("resources");
  const tc = useTranslations("common");

  const [items, setItems] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ─── Header ─── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FolderOpen className="h-6 w-6" />
          {t("downloadsTitle")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{t("downloadsSubtitle")}</p>
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

      {/* ─── Grid ─── */}
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item._id}
              className="rounded-lg border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-primary shrink-0" />
                  <h3 className="font-semibold truncate">{item.title}</h3>
                </div>

                <Badge variant="outline" className="capitalize">{item.category}</Badge>

                {item.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
                )}

                {/* Files */}
                <div className="space-y-1.5">
                  {item.files.map((file) => (
                    <div
                      key={file.key}
                      className="flex items-center justify-between rounded border px-3 py-2 text-sm bg-muted/30 hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {file.contentType.startsWith("image/") ? (
                          <Image className="h-4 w-4 shrink-0 text-blue-500" />
                        ) : file.contentType.startsWith("video/") ? (
                          <Video className="h-4 w-4 shrink-0 text-purple-500" />
                        ) : (
                          <FileText className="h-4 w-4 shrink-0 text-amber-500" />
                        )}
                        <span className="truncate">{file.fileName}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatFileSize(file.size)}
                        </span>
                      </div>

                      <div className="flex gap-1 shrink-0 ml-2">
                        {isPreviewable(file.contentType) && (
                          <button
                            onClick={() => setPreviewUrl(file.url)}
                            className="p-1 rounded hover:bg-accent"
                            title={t("preview")}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        <a
                          href={file.url}
                          download={file.fileName}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded hover:bg-accent"
                          title={t("download")}
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
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
    </div>
  );
}
