"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  FolderOpen, Search, Inbox, FileText, Image, Video,
  Download, Eye, Tag, History,
} from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useTranslations } from "next-intl";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { formatDate } from "@/lib/ui/intlFormat";

interface ResourceFile { fileName: string; url: string; key: string; contentType: string; size: number; }
interface Resource {
  _id: string; title: string; description?: string; category: string;
  tags: string[]; accessLevel: string; version: number; downloadCount: number;
  files: ResourceFile[]; createdAt: string;
}

const CATEGORY_KEYS = [
  "standee_designs", "brochures", "flyers", "employer_kits", "candidate_forms",
  "booth_designs", "presentation_decks", "exhibition_videos", "contracts",
  "vendor_documents", "travel_templates", "branding_assets", "compliance_docs", "other",
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ResourceDownloadsPage() {
  const t = useTranslations("resources");
  const tc = useTranslations("common");
  const CATEGORY_OPTIONS = [
    { value: "all", label: t("categories.all") },
    ...CATEGORY_KEYS.map((k) => ({ value: k, label: t(`categories.${k}`) })),
  ];
  const SORT_OPTIONS = [
    { value: "newest", label: t("sortNewest") },
    { value: "popular", label: t("sortPopular") },
    { value: "a-z", label: t("sortAZ") },
  ];
  const [items, setItems] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [search, setSearch] = useState("");
  const [previewUrl, setPreviewUrl] = useState<{url: string; type: string} | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort: sortBy, limit: "50" });
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/resources?${params}`);
      if (res.ok) { const data = await res.json(); setItems(data.items ?? []); }
    } catch { toast.error(t("fetchError")); } finally { setLoading(false); }
  }, [categoryFilter, sortBy, search, t]);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  const trackDownload = async (item: Resource, file: ResourceFile) => {
    try {
      await csrfFetch(`/api/resources/${item._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileKey: file.key, fileName: file.fileName }),
      });
    } catch { /* ignore */ }
    window.open(file.url, "_blank");
  };

  return (
    <div className="page-container">
      <DashboardPageHeader
        icon={FolderOpen}
        title={t("downloadsTitle")}
        description={t("downloadsSubtitle")}
        footer={
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1 basis-full sm:basis-auto">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9 text-sm" />
            </div>
            <div className="min-w-0 flex-1 basis-0 sm:flex-none">
              <SearchableSelect options={CATEGORY_OPTIONS} value={categoryFilter} onValueChange={setCategoryFilter} placeholder={t("filterCategory")} />
            </div>
            <div className="min-w-0 flex-1 basis-0 sm:flex-none">
              <SearchableSelect options={SORT_OPTIONS} value={sortBy} onValueChange={setSortBy} placeholder={t("sortLabel")} />
            </div>
            {categoryFilter !== "all" && <button onClick={() => setCategoryFilter("all")} className="text-xs text-muted-foreground underline">{t("clear")}</button>}
          </div>
        }
      />

      {/* Resource Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (<div key={i} className="h-48 animate-pulse rounded-2xl bg-background/70" />))}
        </div>
      ) : items.length === 0 ? (
        <section className="workspace-panel-surface rounded-3xl p-10 sm:p-14 text-center">
          <div className="flex flex-col items-center">
            <div className="workspace-glass-panel card-pad rounded-2xl mb-5">
              <Inbox className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="heading-subsection font-semibold text-foreground">{t("noResources")}</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm">
              {t("noResourcesHint")}
            </p>
          </div>
        </section>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const CatIcon = item.files?.[0]?.contentType?.startsWith("video/") ? Video : item.files?.[0]?.contentType?.startsWith("image/") ? Image : FileText;
            return (
              <article key={item._id} className="workspace-glass-panel rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_50px_-38px_rgba(2,132,199,0.38)]">
                <div className="p-3 sm:p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl ring-1 ring-inset ring-border/60 bg-background/80 shrink-0 chip-pad">
                      <CatIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="heading-subsection font-semibold text-foreground truncate">{item.title}</h3>
                      <p className="text-xs text-muted-foreground">{CATEGORY_KEYS.includes(item.category) ? t(`categories.${item.category}`) : item.category}</p>
                    </div>
                  </div>

                  {item.description && <p className="text-sm leading-6 text-muted-foreground line-clamp-2">{item.description}</p>}

                  {item.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {item.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-0.5 rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"><Tag className="h-2.5 w-2.5" />{tag}</span>
                      ))}
                      {item.tags.length > 3 && <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">+{item.tags.length - 3}</span>}
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><Download className="h-3.5 w-3.5" /> {item.downloadCount ?? 0}</span>
                    <span className="flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> v{item.version ?? 1}</span>
                  </div>

                  <div className="space-y-2">
                    {item.files.map((file) => (
                      <div key={file.key} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/60 text-xs chip-pad">
                        <span className="truncate font-medium text-foreground">{file.fileName} <span className="text-muted-foreground">({formatFileSize(file.size)})</span></span>
                        <div className="flex gap-1 shrink-0">
                          {(file.contentType?.startsWith("image/") || file.contentType === "application/pdf") && (
                            <button onClick={() => setPreviewUrl({url: file.url, type: file.contentType})} className="p-1.5 rounded-lg hover:bg-card transition-colors"><Eye className="h-3.5 w-3.5 text-muted-foreground" /></button>
                          )}
                          <button onClick={() => trackDownload(item, file)} className="p-1.5 rounded-lg hover:bg-card transition-colors text-primary"><Download className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-muted-foreground">{formatDate(new Date(item.createdAt))}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader><DialogTitle>{t("preview")}</DialogTitle></DialogHeader>
          {previewUrl && (
            previewUrl.type.startsWith("image/")
              ? <img src={previewUrl.url} alt="Preview" className="max-h-[65vh] w-full object-contain rounded-lg" />
              : <embed src={previewUrl.url} type="application/pdf" className="w-full h-[65vh] rounded-lg" />
          )}
          {previewUrl && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => window.open(previewUrl.url, '_blank')}>{t("openInNewTab")}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
