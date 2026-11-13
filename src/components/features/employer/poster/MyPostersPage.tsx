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
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { RowActions } from "@/components/shared/RowActions";
import { PaginationControls } from "@/components/shared/PaginationControls";
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
  /** "brand" = drawn from the brand kit by /api/poster/[slug]/image; AI posters have variations. */
  kind?: "ai" | "brand";
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

// A 4-wide grid: page sizes that fill whole rows.
const POSTER_PAGE_SIZES = [12, 24, 48] as const;

export function MyPostersPage({ jobId, embedded = false }: { jobId?: string; embedded?: boolean } = {}) {
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("myPosters");
  const tCommon = useTranslations("common");
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
    queryKey: ["employer-posters", jobId ?? "all", page, limit],
    queryFn: async () => {
      const url = new URL("/api/employers/posters", window.location.origin);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", String(limit));
      if (jobId) {
        url.searchParams.set("jobId", jobId);
      }
      const res = await fetch(url.toString());
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

  const wrapperClass = embedded ? "space-y-4" : "page-container";

  return (
    <div className={wrapperClass}>
      {ConfirmDialogNode}
      {/* Pattern A (compact workspace): title, one context line (the eyebrow
          on phones, the description from sm), credits + the create action. */}
      {!embedded && (
        <WorkspaceHeader
          title={t("title")}
          context={
            <>
              <span className="sm:hidden">{t("posterCount", { count: data?.posters?.length ?? 0 })}</span>
              <span className="hidden sm:inline">{t("description")}</span>
            </>
          }
          actions={
            <>
              <CreditsBadge credits={credits} />
              <Link
                href={`/${locale}/employer/jobs`}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground shadow transition-colors hover:bg-primary/90 sm:px-4"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("createCta")}
              </Link>
            </>
          }
        />
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : !data?.posters?.length ? (
        <div className={`flex flex-col items-center justify-center text-center ${embedded ? "py-6" : "py-12"}`}>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Image className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="heading-subsection font-semibold">{t("emptyTitle")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("emptyHint")}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.posters.map((poster) => {
              const isBrand = poster.kind === "brand";
              const thumb = isBrand
                ? null
                : poster.variations[poster.selectedVariation]?.backgroundUrl || poster.variations[0]?.backgroundUrl;
              // Card click reopens this poster in the editor (same tab) — saved
              // design + overrides restore there, so posters double as reusable templates.
              // Brand posters have no AI editor state: they reopen the poster maker for the job.
              const reuseHref = poster.jobId?._id
                ? `/${locale}/employer/jobs/${poster.jobId._id}/poster${isBrand ? "" : `?generation=${poster._id}`}`
                : null;
              return (
                <div
                  key={poster._id}
                  className="group relative rounded-xl border overflow-hidden bg-card shadow-sm hover:shadow-md transition-shadow focus-within:ring-2 focus-within:ring-ring"
                >
                  {/* Opens this poster in the editor. A link stretched under the
                      card, so View and Delete below are its siblings — a card
                      that was itself a button held buttons inside a button. */}
                  {reuseHref && (
                    <Link
                      href={reuseHref}
                      aria-label={t("reusePosterLabel", { job: poster.jobId?.title || t("untitledJob") })}
                      className="absolute inset-0 z-0 focus-visible:outline-none"
                    />
                  )}
                  {/* Composed poster thumbnail (background + branding/text overlay).
                      Clicks pass through to the link; only the actions take them. */}
                  <div className="aspect-square relative pointer-events-none" style={{ containerType: "size" }}>
                    {isBrand && poster.shareSlug ? (
                       
                      <img
                        src={`/api/poster/${poster.shareSlug}/image?size=square`}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : thumb ? (
                      <div aria-hidden="true">
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
                      </div>
                    ) : (
                      <div className="absolute inset-0 bg-muted flex items-center justify-center" aria-hidden="true">
                        <Image className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="pointer-events-none space-y-1.5 p-3">
                    <p className="line-clamp-2 break-words text-sm font-medium">
                      {poster.jobId?.title || t("untitledJob")}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="capitalize">{poster.type.replace("-", " ")}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{poster.style}</span>
                    </div>
                    {/* Analytics */}
                    <div className="flex items-center gap-3 border-t pt-1 text-[11px] text-muted-foreground">
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
                  {/* Actions sit under the artwork with their words. As icons laid
                      over every poster (always on, on touch screens) they dimmed
                      the artwork and a bare bin sat one slip from the open link. */}
                  <div className="relative z-10 flex items-center justify-between gap-2 border-t px-3 py-2">
                    <RowActions
                      name={poster.jobId?.title || t("untitledJob")}
                      labelsFrom="always"
                      className="w-full justify-between"
                      quick={[
                        ...(poster.shareSlug ? [{ key: "view", label: tCommon("view"), icon: ExternalLink, href: buildPosterShareUrl(poster.shareSlug), external: true }] : []),
                        {
                          key: "delete",
                          label: tCommon("delete"),
                          icon: Trash2,
                          iconOnly: true,
                          destructive: true,
                          onSelect: async () => {
                            if (await confirm({ message: t("deleteConfirm"), variant: "destructive" })) deleteMutation.mutate(poster._id);
                          },
                        },
                      ]}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* The shared page bar, like every other list (it was a third, hand-built style). */}
          <PaginationControls
            page={page}
            totalPages={data.pagination.pages}
            total={data.pagination.total}
            limit={limit}
            sizeOptions={POSTER_PAGE_SIZES}
            onPageChange={setPage}
            onLimitChange={(next) => { setLimit(next); setPage(1); }}
          />
        </>
      )}
    </div>
  );
}
