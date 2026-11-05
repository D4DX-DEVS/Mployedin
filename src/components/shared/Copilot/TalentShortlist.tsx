"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertCircle, Briefcase, ChevronDown, Download, FileArchive, FileSpreadsheet, FileText, Loader2, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/shared/UserAvatar";
import type { TalentRow } from "@/lib/ai/copilot/views";
import {
  downloadShortlistExcel, downloadShortlistPdf, downloadShortlistZip, fetchShortlistDetails, type ShortlistColumns,
} from "./candidateShortlistExport";

/** Rows shown before "Show all": enough to read without scrolling the chat away. */
const COLLAPSED = 5;

interface TalentShortlistProps {
  talent: TalentRow[];
  totalMatched: number;
  relaxed: boolean;
  brief: string;
  onInternalLink: () => void;
}

function fitTone(fit: number): string {
  if (fit >= 75) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (fit >= 50) return "bg-primary/10 text-primary ring-primary/20";
  return "bg-muted text-muted-foreground ring-border";
}

type ExportKind = "excel" | "pdf" | "zip";

/** The ranked candidates find_candidates returned, with downloads for the whole list. */
export function TalentShortlist({ talent, totalMatched, relaxed, brief, onInternalLink }: TalentShortlistProps) {
  const t = useTranslations("copilot.views.talent");
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const shown = expanded ? talent : talent.slice(0, COLLAPSED);

  const columns: ShortlistColumns = {
    rank: t("col.rank"), name: t("col.name"), title: t("col.title"), fit: t("col.fit"),
    experience: t("col.experience"), location: t("col.location"), nationality: t("col.nationality"),
    email: t("col.email"), phone: t("col.phone"), skills: t("col.skills"), cv: t("col.cv"),
  };

  const runExport = async (kind: ExportKind) => {
    setExporting(kind);
    try {
      const details = await fetchShortlistDetails(talent.map((r) => r.seekerId));
      const fits = new Map(talent.map((r) => [r.seekerId, r.fit]));
      if (kind === "pdf") {
        await downloadShortlistPdf(details, fits, columns, brief, t("pdfTitle"));
        toast.success(t("exportDone", { count: details.length }));
      } else if (kind === "zip" && details.some((d) => d.hasCV)) {
        const cvs = await downloadShortlistZip(details, fits, columns, brief);
        toast.success(t("zipDone", { cvs }));
      } else {
        await downloadShortlistExcel(details, fits, columns, brief);
        if (kind === "zip") toast.info(t("noCvs"));
        else toast.success(t("exportDone", { count: details.length }));
      }
    } catch {
      toast.error(t("exportFailed"));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card text-xs shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{t("heading", { shown: talent.length, total: totalMatched })}</p>
          {brief && <p className="truncate text-muted-foreground">{brief}</p>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5" disabled={exporting !== null}>
              {exporting ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
              {exporting ? t("exporting") : t("export")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void runExport("excel")}>
              <FileSpreadsheet className="size-4" aria-hidden />
              {t("exportExcel")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void runExport("pdf")}>
              <FileText className="size-4" aria-hidden />
              {t("exportPdf")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void runExport("zip")}>
              <FileArchive className="size-4" aria-hidden />
              {t("exportZip")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {relaxed && (
        <p className="flex items-start gap-1.5 border-b border-border bg-amber-50 px-3 py-2 text-amber-800">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {t("relaxed")}
        </p>
      )}

      <ol className="divide-y divide-border">
        {shown.map((c, index) => {
          const placeLabel =
            c.locationFit === "current" ? t("inPlace")
            : c.locationFit === "worked" ? t("workedThere")
            : c.locationFit === "prefers" ? t("prefersPlace")
            : null;
          const years =
            c.experienceFit === "unknown" || c.experienceYears === undefined
              ? t("yearsUnknown")
              : t("yearsShort", { count: c.experienceYears });
          return (
            <li key={c.seekerId || `talent-${index}`} className="flex gap-2.5 p-3">
              <span className="mt-2 w-4 shrink-0 text-end text-[11px] font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
              <UserAvatar name={c.name} className="size-9 shrink-0" colorful />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/${locale}/admin/job-seekers?search=${encodeURIComponent(c.name)}`}
                    onClick={onInternalLink}
                    aria-label={t("openProfile", { name: c.name })}
                    className="min-w-0 truncate text-sm font-medium text-foreground hover:underline"
                  >
                    {c.name}
                  </Link>
                  <span
                    className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1", fitTone(c.fit))}
                  >
                    {t("fit", { fit: c.fit })}
                  </span>
                </div>
                {c.title && (
                  <p className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                    <Briefcase className="size-3 shrink-0" aria-hidden />
                    <span className="line-clamp-1">{c.title}</span>
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {c.location && (
                    <span
                      className={cn(
                        "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5",
                        placeLabel ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground",
                      )}
                      title={placeLabel ?? undefined}
                    >
                      <MapPin className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{c.location}</span>
                    </span>
                  )}
                  {!c.location && placeLabel && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                      <MapPin className="size-3" aria-hidden />
                      {placeLabel}
                    </span>
                  )}
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5",
                      c.experienceFit === "below" ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground",
                    )}
                    title={c.experienceFit === "below" ? t("belowYears") : undefined}
                  >
                    {years}
                  </span>
                  {c.hasCV ? (
                    <a
                      href={`/api/employers/candidates/${c.seekerId}/cv`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t("viewCv", { name: c.name })}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary hover:bg-primary/15"
                    >
                      <FileText className="size-3" aria-hidden />
                      {t("cv")}
                    </a>
                  ) : (
                    <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-muted-foreground">{t("noCv")}</span>
                  )}
                </div>
                {c.skills.length > 0 && (
                  <p className="mt-1.5 line-clamp-1 text-muted-foreground">{c.skills.slice(0, 4).join(" · ")}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {talent.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-border py-2 font-medium text-primary hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary"
          aria-expanded={expanded}
        >
          {expanded ? t("showFewer") : t("showAll", { count: talent.length })}
          <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} aria-hidden />
        </button>
      )}
    </div>
  );
}
