"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Image, Trash2, ExternalLink, Eye, Download, QrCode, Sparkles, Plus } from "lucide-react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { buildPosterShareUrl } from "@/lib/composer/branding";
import { CreditsBadge } from "./CreditsBadge";
import { usePosterCredits } from "@/hooks/usePosterCredits";

interface PosterItem {
  _id: string;
  jobId: { _id: string; title: string } | null;
  type: string;
  style: string;
  variations: { backgroundUrl: string; layout: string }[];
  selectedVariation: number;
  shareSlug: string;
  analytics: { views: number; downloads: number; qrScans: number };
  createdAt: string;
}

export function MyPostersPage() {
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { credits } = usePosterCredits();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["employer-posters", page],
    queryFn: async () => {
      const res = await fetch(`/api/employers/posters?page=${page}&limit=12`);
      if (!res.ok) throw new Error("Failed to fetch posters");
      return res.json() as Promise<{ posters: PosterItem[]; pagination: { page: number; pages: number; total: number } }>;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/employers/posters/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employer-posters"] }),
  });

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Posters</h1>
          <p className="text-sm text-muted-foreground">
            All your AI-generated recruitment posters
          </p>
        </div>
        <CreditsBadge credits={credits} />
      </div>

      {/* Hero CTA Card */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 p-6 md:p-8">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">AI Recruitment Marketing Engine</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Create eye-catching AI-generated posters for your jobs. Share on social media, print, or use QR codes to attract top talent.
              </p>
            </div>
          </div>
          <Link
            href={`/${locale}/employer/jobs`}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            Create Poster from Job
          </Link>
        </div>
        {/* Decorative background */}
        <div className="absolute top-0 right-0 w-64 h-64 opacity-5">
          <Image className="w-full h-full" />
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : !data?.posters?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Image className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">No posters yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first AI recruitment poster from any job listing.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.posters.map((poster) => {
              const thumb = poster.variations[poster.selectedVariation]?.backgroundUrl
                || poster.variations[0]?.backgroundUrl;
              return (
                <div
                  key={poster._id}
                  className="group relative rounded-xl border overflow-hidden bg-card shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Thumbnail */}
                  <div className="aspect-square relative">
                    {thumb ? (
                      <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${thumb})` }}
                      />
                    ) : (
                      <div className="absolute inset-0 bg-muted flex items-center justify-center">
                        <Image className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                    {/* Hover actions */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      {poster.shareSlug && (
                        <a
                          href={buildPosterShareUrl(poster.shareSlug)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-full bg-white/20 hover:bg-white/30"
                        >
                          <ExternalLink className="w-4 h-4 text-white" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm("Delete this poster? This cannot be undone.")) {
                            deleteMutation.mutate(poster._id);
                          }
                        }}
                        className="p-2 rounded-full bg-white/20 hover:bg-red-500/50"
                      >
                        <Trash2 className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-3 space-y-1.5">
                    <p className="text-sm font-medium truncate">
                      {poster.jobId?.title || "Untitled Job"}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="capitalize">{poster.type.replace("-", " ")}</span>
                      <span>•</span>
                      <span className="capitalize">{poster.style}</span>
                    </div>
                    {/* Analytics */}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1 border-t">
                      <span className="flex items-center gap-0.5">
                        <Eye className="w-3 h-3" /> {poster.analytics.views}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Download className="w-3 h-3" /> {poster.analytics.downloads}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <QrCode className="w-3 h-3" /> {poster.analytics.qrScans}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {data.pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-md border text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {data.pagination.pages}
              </span>
              <button
                type="button"
                disabled={page >= data.pagination.pages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-md border text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
