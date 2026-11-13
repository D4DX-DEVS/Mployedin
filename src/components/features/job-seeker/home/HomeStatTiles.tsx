"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bookmark, CalendarDays, FileText, Gift, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface HomeStatTile {
  key: string;
  href: string;
  icon: LucideIcon;
  /** Icon chip colours. */
  tone: string;
  label: string;
  value: number;
  /** "of 42" beside the value. */
  of?: number;
}

/** The four tiles, in their fixed order. A tile shows once its count has loaded. */
export function buildHomeStatTiles(input: {
  locale: string;
  labels: { active: string; interviewing: string; offers: string; saved: string };
  active?: number;
  total?: number;
  /** At the interview step: interviewing or selected by the employer. */
  interviewing?: number;
  offers?: number;
  saved?: number;
}): HomeStatTile[] {
  const base = `/${input.locale}/job-seeker`;
  const tiles: Array<HomeStatTile | null> = [
    typeof input.active === "number"
      ? { key: "active", href: `${base}/applications`, icon: FileText, tone: "bg-primary/10 text-primary", label: input.labels.active, value: input.active, of: input.total }
      : null,
    typeof input.interviewing === "number"
      ? { key: "interviewing", href: `${base}/interviews`, icon: CalendarDays, tone: "bg-violet-100 text-violet-700", label: input.labels.interviewing, value: input.interviewing }
      : null,
    typeof input.offers === "number"
      ? { key: "offers", href: `${base}/offers`, icon: Gift, tone: "bg-emerald-100 text-emerald-700", label: input.labels.offers, value: input.offers }
      : null,
    typeof input.saved === "number"
      ? { key: "saved", href: `${base}/saved-jobs`, icon: Bookmark, tone: "bg-amber-100 text-amber-700", label: input.labels.saved, value: input.saved }
      : null,
  ];
  return tiles.filter((tile): tile is HomeStatTile => tile !== null);
}

/**
 * Where the seeker's applications stand, as four links. Same tiles at every
 * width — two by two on phones — so the page reads the same on each screen.
 */
export function HomeStatTiles({ tiles, locale }: { tiles: HomeStatTile[]; locale: string }) {
  const t = useTranslations("jobSeekerHome");
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  if (tiles.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-home-tiles>
      {tiles.map((tile) => (
        <Link
          key={tile.key}
          href={tile.href}
          className="flex min-w-0 flex-col gap-1 rounded-2xl border border-border/80 bg-card p-3 shadow-xs transition-colors hover:border-primary/40 sm:gap-2 sm:p-4"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg sm:size-8", tile.tone)}>
              <tile.icon className="size-4" aria-hidden />
            </span>
            <span className="truncate text-xs text-muted-foreground sm:text-sm">{tile.label}</span>
          </span>
          <span className="text-lg font-bold leading-6 text-foreground sm:text-2xl sm:leading-8">
            {tile.value.toLocaleString(numberLocale)}
            {typeof tile.of === "number" && tile.of > tile.value && (
              <small className="ms-1.5 text-xs font-medium text-muted-foreground sm:text-sm">
                {t("tiles.of", { total: tile.of.toLocaleString(numberLocale) })}
              </small>
            )}
          </span>
        </Link>
      ))}
    </div>
  );
}
