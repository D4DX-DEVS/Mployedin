"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  FolderOpen, Clock, Search, Inbox, FileText, Image, Video,
  Download, Eye, Tag, Shield, History,
} from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useTranslations } from "next-intl";

interface ResourceFile { fileName: string; url: string; key: string; contentType: string; size: number; }
interface Resource {
  _id: string; title: string; description?: string; category: string;
  tags: string[]; accessLevel: string; version: number; downloadCount: number;
  files: ResourceFile[]; createdAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  standee_designs: "Standee Designs", brochures: "Brochures", flyers: "Flyers",
  employer_kits: "Employer Kits", candidate_forms: "Candidate Forms", booth_designs: "Booth Designs",
  presentation_decks: "Presentation Decks", exhibition_videos: "Exhibition Videos",
  contracts: "Contracts", vendor_documents: "Vendor Documents", travel_templates: "Travel Templates",
  branding_assets: "Branding Assets", compliance_docs: "Compliance Docs", other: "Other",
};
const CATEGORY_OPTIONS = [{ value: "all", label: "All Categories" }, ...Object.entries(CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l }))];
const SORT_OPTIONS = [
  { value: "newest", label: "Newest" }, { value: "popular", label: "Most Downloaded" }, { value: "a-z", label: "A â†’ Z" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ResourceDownloadsPage() {
  const t = useTranslations("resources");
  const tc = useTranslations("common");
  const [items, setItems] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [search, setSearch] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
    try { await csrfFetch(`/api/resources/${item._id}`, { method: "POST" }); } catch { /* ignore */ }
    window.open(file.url, "_blank");
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FolderOpen className="h-6 w-6 text-primary" /> {t("downloadsTitle")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("downloadsSubtitle")}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
        <SearchableSelect options={CATEGORY_OPTIONS} value={categoryFilter} onValueChange={setCategoryFilter} placeholder="Category" />
        <SearchableSelect options={SORT_OPTIONS} value={sortBy} onValueChange={setSortBy} placeholder="Sort" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Clock className="h-5 w-5 animate-spin mr-2" /> {tc("loading")}</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground"><Inbox className="h-12 w-12 mb-3 opacity-40" /><p>{t("noResources")}</p></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const CatIcon = item.files?.[0]?.contentType?.startsWith("video/") ? Video : item.files?.[0]?.contentType?.startsWith("image/") ? Image : FileText;
            return (
              <div key={item._id} className="rounded-xl border bg-card p-4 hover:shadow-md transition-shadow">
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <CatIcon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate">{item.title}</h3>
                      <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[item.category] ?? item.category}</p>
                    </div>
                  </div>
                  {item.description && <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>}
                  {item.tags?.length > 0 && (<div className="flex flex-wrap gap-1">{item.tags.slice(0, 3).map((tag) => (<Badge key={tag} variant="outline" className="text-xs"><Tag className="h-2.5 w-2.5 mr-0.5" />{tag}</Badge>))}{item.tags.length > 3 && <Badge variant="outline" className="text-xs">+{item.tags.length - 3}</Badge>}</div>)}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Download className="h-3 w-3" /> {item.downloadCount ?? 0}</span>
                    <span className="flex items-center gap-1"><History className="h-3 w-3" /> v{item.version ?? 1}</span>
                  </div>
                  <div className="space-y-1.5">
                    {item.files.map((file) => (
                      <div key={file.key} className="flex items-center justify-between rounded border px-3 py-2 text-xs bg-muted/30 hover:bg-muted/60 transition-colors">
                        <span className="truncate mr-2">{file.fileName} <span className="text-muted-foreground">({formatFileSize(file.size)})</span></span>
                        <div className="flex gap-1 shrink-0">
                          {(file.contentType?.startsWith("image/") || file.contentType === "application/pdf") && (
                            <button onClick={() => setPreviewUrl(file.url)} className="p-1 rounded hover:bg-accent"><Eye className="h-3.5 w-3.5" /></button>
                          )}
                          <button onClick={() => trackDownload(item, file)} className="p-1 rounded hover:bg-accent text-primary"><Download className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader><DialogTitle>{t("preview")}</DialogTitle></DialogHeader>
          {previewUrl && (previewUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)/i) ? <img src={previewUrl} alt="Preview" className="max-h-[60vh] w-full object-contain" /> : <iframe src={previewUrl} className="w-full h-[60vh]" title="Preview" />)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
