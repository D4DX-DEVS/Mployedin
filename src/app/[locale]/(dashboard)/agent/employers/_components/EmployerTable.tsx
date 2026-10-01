"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, BriefcaseBusiness, Building2, Check, Edit2, LogIn, MapPin, Trash2 } from "lucide-react";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TableBodySkeleton } from "@/components/ui/loading";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Employer, EmployerListProps } from "./types";

const COLUMN_COUNT = 4;

export function EmployerTable({
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

  // Same actions as a card. Posting, entering the account and editing need the
  // employer assigned to me; a region-only row can still open its jobs.
  const rowActions = (em: Employer): { quick: RowAction[]; menu: RowAction[] } => {
    const company = em.companyName ?? em.name;
    const viewJobs: RowAction = {
      key: "jobs",
      label: t("cardViewJobsTooltip"),
      icon: ArrowRight,
      href: `/${locale}/agent/jobs?employer=${em._id}`,
    };
    const remove: RowAction[] = canDelete
      ? [{ key: "delete", label: tc("delete"), icon: Trash2, iconOnly: true, destructive: true, onSelect: () => onDelete(em._id) }]
      : [];
    if (!em.assignedToMe) return { quick: [viewJobs], menu: remove };
    return {
      // The arrow alone, as on the card: a labelled "View Jobs" next to "Post
      // Job" pushed the row's actions out of the panel at 1280px.
      quick: [
        { key: "post", label: t("cardPostJobButton"), icon: BriefcaseBusiness, href: `/${locale}/agent/jobs/new?employer=${em._id}` },
        { ...viewJobs, iconOnly: true },
        {
          key: "switch",
          label: t("cardSwitchWorkspaceAriaLabel", { company }),
          icon: LogIn,
          iconOnly: true,
          pending: switchingEmployerId === em._id,
          disabled: switchingEmployerId === em._id || !em.isActive,
          onSelect: () => onSwitch(em._id),
        },
        ...(canUpdate
          ? [{ key: "edit", label: t("cardEditAriaLabel", { company }), icon: Edit2, iconOnly: true, onSelect: () => onEdit(em) }]
          : []),
      ],
      menu: remove,
    };
  };

  return (
    <section className="workspace-panel-surface overflow-hidden rounded-3xl">
      <div className="overflow-x-auto">
        <TooltipProvider delayDuration={200}>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="min-w-[200px]">{t("exportColumnCompany")}</TableHead>
                <TableHead>{tc("status")}</TableHead>
                {/* Secondary: below 1280px the row keeps company, status and
                    actions, and the cards view still shows both fields. */}
                <TableHead className="hidden xl:table-cell">{`${t("exportColumnIndustry")} / ${t("exportColumnLocation")}`}</TableHead>
                <TableHead className="text-end">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={6} cols={COLUMN_COUNT} />
              ) : (
                employers.map((em) => {
                  const { quick, menu } = rowActions(em);
                  return (
                    <TableRow key={em._id}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="workspace-tone-sky flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                            <Building2 className="h-4 w-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0 max-w-[14rem]">
                            <p className="truncate font-medium text-foreground">{em.companyName ?? em.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{em.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={em.isActive ? "active" : "inactive"} />
                          {em.isAgentVerified && (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-status-selected">
                              <Check className="h-3 w-3" aria-hidden="true" />
                              {tc("verified")}
                            </span>
                          )}
                          {/* Only the exception is marked, as on the card: a row
                              without Post Job says why. */}
                          {!em.assignedToMe && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                {/* Focusable so keyboard users reach the reason too. */}
                                <span
                                  tabIndex={0}
                                  className="inline-flex cursor-help items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                                >
                                  <MapPin className="h-3 w-3" aria-hidden="true" />
                                  {t("inYourRegion")}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-64">{t("cardRegionOnly")}</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground xl:table-cell">
                        {/* One wrapper: the phone card lays a cell out as a
                            label/value grid, and two loose spans split across it. */}
                        <div>
                          <span className="block">{em.industry || "—"}</span>
                          <span className="mt-1 block text-xs">{em.location || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-end">
                        <RowActions name={em.companyName ?? em.name} quick={quick} menu={menu} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>
    </section>
  );
}
