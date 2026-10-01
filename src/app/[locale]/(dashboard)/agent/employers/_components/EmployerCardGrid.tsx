"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, BriefcaseBusiness, Building2, Check, Edit2, Globe2, Loader2, LogIn, MapPin, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { EmployerListProps } from "./types";

export function EmployerCardGrid({
  employers,
  loading,
  locale,
  canUpdate,
  canDelete,
  switchingEmployerId,
  onSwitch,
  onEdit,
  onDelete,
}: EmployerListProps) {
  const t = useTranslations("agentEmployers");
  const tc = useTranslations("common");

  if (loading) {
    return (
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="workspace-panel-surface space-y-4 overflow-hidden rounded-3xl panel-body">
            <div className="flex items-start gap-2">
              <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-9 flex-1 rounded-xl" />
              <Skeleton className="h-9 w-12 rounded-xl" />
            </div>
          </div>
        ))}
      </section>
    );
  }

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {employers.map((em) => (
        <div key={em._id} className="workspace-panel-surface space-y-4 overflow-hidden rounded-3xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_64px_-42px_rgba(2,132,199,0.32)] panel-body">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="workspace-tone-sky flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{em.companyName ?? em.name}</p>
                <p className="truncate text-xs text-muted-foreground">{em.email}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {em.isAgentVerified && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] bg-green-500/10 text-status-selected px-2 py-0.5 rounded-full font-medium"><Check className="h-3 w-3" aria-hidden="true" />{tc("verified")}</span>
              )}
              <StatusBadge status={em.isActive ? "active" : "inactive"} />
            </div>
          </div>

          <div className="space-y-2 text-xs text-muted-foreground">
            {em.industry && <p className="flex items-center gap-2"><Globe2 className="h-3.5 w-3.5 text-muted-foreground" /> {t("cardFieldIndustry")}: {em.industry}</p>}
            {em.location && <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /> {t("cardFieldLocation")}: {em.location}</p>}
          </div>

          <TooltipProvider delayDuration={200}>
            <div className="flex flex-wrap gap-2 pt-1">
              {em.assignedToMe ? (
                <Link
                  href={`/${locale}/agent/jobs/new?employer=${em._id}`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
                >
                  <BriefcaseBusiness className="h-3.5 w-3.5" /> {t("cardPostJobButton")}
                </Link>
              ) : (
                <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{t("cardRegionOnly")}</span>
                </p>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={`/${locale}/agent/jobs?employer=${em._id}`}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/20 hover:text-primary chip-pad"
                    aria-label={t("cardViewJobsAriaLabel", { company: em.companyName ?? em.name })}
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>{t("cardViewJobsTooltip")}</TooltipContent>
              </Tooltip>
              {em.assignedToMe && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onSwitch(em._id)}
                      disabled={switchingEmployerId === em._id || !em.isActive}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-sky-400/50 bg-status-applied-bg text-xs font-semibold text-status-applied transition-colors hover:bg-status-applied-bg disabled:opacity-50 chip-pad"
                      aria-label={t("cardSwitchWorkspaceAriaLabel", { company: em.companyName ?? em.name })}
                    >
                      {switchingEmployerId === em._id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <LogIn className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t("cardSwitchWorkspaceTooltip")}</TooltipContent>
                </Tooltip>
              )}
              {em.assignedToMe && canUpdate && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onEdit(em)}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border p-2 transition-colors hover:bg-secondary/80"
                      aria-label={t("cardEditAriaLabel", { company: em.companyName ?? em.name })}
                    >
                      <Edit2 className="h-3.5 w-3.5 text-status-applied" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{tc("edit")}</TooltipContent>
                </Tooltip>
              )}
              {canDelete && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onDelete(em._id)}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border p-2 transition-colors hover:bg-secondary/80"
                      aria-label={t("cardDeleteAriaLabel", { company: em.companyName ?? em.name })}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-status-rejected" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{tc("delete")}</TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        </div>
      ))}
    </section>
  );
}
