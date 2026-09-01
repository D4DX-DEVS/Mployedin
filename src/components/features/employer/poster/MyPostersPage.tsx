"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Image, Trash2, ExternalLink, Eye, Download, QrCode, Plus } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { buildPosterShareUrl } from "@/lib/composer/branding";
import { CreditsBadge } from "./CreditsBadge";
import { PosterOverlay } from "./PosterOverlay";
import { usePosterCredits } from "@/hooks/usePosterCredits";
import { useConfirm } from "@/hooks/useConfirm";
import { PageHero } from "@/components/shared/PageHero";
import type { PosterType, PosterLayout, ShowFields, PosterStyleOverrides } from "@/lib/composer/types";

interface PosterItem {
  _id: string;
  jobId: {
    _id: string; title: string; companyName?: string; logo?: string;
    location?: { city?: string; country?: string };
    salary?: { min?: number; max?: number; currency?: string };
    skills?: string[]; description?: string; responsibilities?: string[]; qualifications?: string[];
    requirements?: { skills?: string[]; education?: string } | null; employmentType?: string;
  } | null;
  type: string;
  style: string;
  showFields?: ShowFields;
  variations: { backgroundUrl: string; layout: string }[];
  selectedVariation: number;
  styleOverrides?: PosterStyleOverrides;
  layoutOverride?: PosterLayout;
  shareSlug: string;
  analytics: { views: number; downloads: number; qrScans: number };
  createdAt: string;
}

const SHOW_ALL: ShowFields = { salary: true, location: true, experience: true, skills: true };

// Numbered pager with first/last always shown and an ellipsis around the current page.
// e.g. page 6 of 20 → [1, "…", 5, 6, 7, "…", 20].
function getPageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push("…");
  for (let n = start; n <= end; n++) out.push(n);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

export function MyPostersPage() {
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("myPosters");
  const queryClient = useQueryClient();
  const { credits } = usePosterCredits();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [page, setPageState] = useState(() => Number(searchParams.get("page")) || 1);

  function setPage(next: number) {
    setPageState(next);
    const params = new URLSearchParams(window.location.search);
    if (next > 1) params.set("page", String(next)); else params.delete("page");
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  const [limit, setLimit] = useState(12);

  const { data, isLoading } = useQuery({
    queryKey: ["employer-posters", page, limit],
    queryFn: async () => {
      const res = await fetch(`/api/employers/posters?page=${page}&limit=${limit}`);
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
    <div className="page-container">
      {ConfirmDialogNode}
      <PageHero
        title={t("title")}
        description={t("description")}
        eyebrow={t("eyebrow")}
        actions={
          /* Flattened out of a wrapper div: DashboardPageHeader's actions row is
             already `flex flex-wrap items-center gap-2 [&>*]:shrink-0`, and that
             shrink-0 applied to a nested div stopped it wrapping, so the credits
             pill + CTA overflowed the card at 360-390px. */
          <>
            <CreditsBadge credits={credits} />
            <Link
              href={`/${locale}/employer/jobs`}
              /* Sized down on phones so the credits pill + CTA fit one row
                 inside the hero (~326px inner at 390px) instead of stacking. */
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-2.5 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors shrink-0 sm:gap-2 sm:px-5 sm:py-2.5 sm:text-sm"
            >
              <Plus className="h-4 w-4" />
              {t("createCta")}
            </Link>
          </>
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
          <h3 className="heading-subsection font-semibold">{t("emptyTitle")}</h3>
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
              // Card click reopens this poster in the editor (same tab) — saved
              // design + overrides restore there, so posters double as reusable templates.
              const reuseHref = poster.jobId?._id
                ? `/${locale}/employer/jobs/${poster.jobId._id}/poster?generation=${poster._id}`
                : null;
              return (
                <div
                  key={poster._id}
                  onClick={() => reuseHref && router.push(reuseHref)}
                  className={`group relative rounded-xl border overflow-hidden bg-card shadow-sm hover:shadow-md transition-shadow ${reuseHref ? "cursor-pointer" : ""}`}
                >
                  {/* Composed poster thumbnail (background + branding/text overlay) */}
                  <div className="aspect-square relative" style={{ containerType: "size" }} aria-hidden="true">
                    {thumb ? (
                      <>
                        <div
                          className="absolute inset-0 bg-cover bg-center"
                          style={{ backgroundImage: `url(${thumb})` }}
                        />
                        <PosterOverlay
                          job={poster.jobId}
                          posterType={poster.type as PosterType}
                          showFields={poster.showFields ?? SHOW_ALL}
                          layout={poster.layoutOverride ?? (poster.variations[poster.selectedVariation]?.layout as PosterLayout) ?? "layout-a"}
                          format="instagram-post"
                          style={poster.styleOverrides}
                        />
                      </>
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
                          onClick={(e) => e.stopPropagation()}
                          aria-label={t("viewPosterLabel", { job: poster.jobId?.title || t("untitledJob") })}
                          className="p-2 rounded-full bg-white/20 hover:bg-white/30"
                        >
                          <ExternalLink className="w-4 h-4 text-white" aria-hidden="true" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
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
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="capitalize">{poster.type.replace("-", " ")}</span>
                      <span>•</span>
                      <span className="capitalize">{poster.style}</span>
                    </div>
                    {/* Analytics */}
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1 border-t">
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

          {/* Pagination: page-size selector + numbered pages */}
          <div className="flex flex-col-reverse items-center justify-between gap-3 pt-4 sm:flex-row">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              {t("perPage")}
              <select
                value={limit}
                onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                className="rounded-md border bg-background px-2 py-1 text-sm"
              >
                {[12, 24, 48].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>

            {data.pagination.pages > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(Math.max(1, page - 1))}
                  className="px-3 py-1.5 rounded-md border text-sm disabled:opacity-50"
                >
                  {t("previous")}
                </button>
                {getPageWindow(page, data.pagination.pages).map((n, i) =>
                  n === "…" ? (
                    <span key={`gap-${i}`} className="px-2 text-sm text-muted-foreground">…</span>
                  ) : (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPage(n as number)}
                      aria-current={n === page ? "page" : undefined}
                      className={`min-w-[2rem] px-2.5 py-1.5 rounded-md border text-sm ${
                        n === page ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                      }`}
                    >
                      {n}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  disabled={page >= data.pagination.pages}
                  onClick={() => setPage(Math.min(data.pagination.pages, page + 1))}
                  className="px-3 py-1.5 rounded-md border text-sm disabled:opacity-50"
                >
                  {t("next")}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
