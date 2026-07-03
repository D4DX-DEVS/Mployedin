"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Image, Trash2, ExternalLink, Eye, Download, QrCode, Plus } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { buildPosterShareUrl } from "@/lib/composer/branding";
import { CreditsBadge } from "./CreditsBadge";
import { usePosterCredits } from "@/hooks/usePosterCredits";
import { useConfirm } from "@/hooks/useConfirm";
import { PageHero } from "@/components/shared/PageHero";

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
  const t = useTranslations("myPosters");
  const queryClient = useQueryClient();
  const { credits } = usePosterCredits();
  const { confirm, ConfirmDialogNode } = useConfirm();
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
    onError: () => toast.error(t("deleteError")),
  });

  return (
    <div className="page-container space-y-6">
      {ConfirmDialogNode}
      <PageHero
        title={t("title")}
        description={t("description")}
        eyebrow={t("eyebrow")}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <CreditsBadge credits={credits} />
            <Link
              href={`/${locale}/employer/jobs`}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors shrink-0"
            >
              <Plus className="h-4 w-4" />
              {t("createCta")}
            </Link>
          </div>
        }
      />

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
          <h3 className="text-lg font-semibold">{t("emptyTitle")}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t("emptyHint")}
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
                        onClick={async () => {
                          const ok = await confirm({
                            message: t("deleteConfirm"),
                            variant: "destructive",
                          });
                          if (ok) deleteMutation.mutate(poster._id);
                        }}
                        aria-label={t("deleteLabel")}
                        className="p-2 rounded-full bg-white/20 hover:bg-red-500/50"
                      >
                        <Trash2 className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-3 space-y-1.5">
                    <p className="text-sm font-medium truncate">
                      {poster.jobId?.title || t("untitledJob")}
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
                {t("previous")}
              </button>
              <span className="text-sm text-muted-foreground">
                {t("pageOf", { page, pages: data.pagination.pages })}
              </span>
              <button
                type="button"
                disabled={page >= data.pagination.pages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-md border text-sm disabled:opacity-50"
              >
                {t("next")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
