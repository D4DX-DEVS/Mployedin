"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, BriefcaseBusiness, Building2, Check, Edit2, LogIn, MapPin, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { PhoneRecordList } from "@/components/shared/PhoneRecordList";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TableBodySkeleton } from "@/components/ui/loading";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NO_ACTIVITY } from "@/lib/agents/accountActivity";
import type { Employer, EmployerListProps } from "./types";
import { ClientPlanChip, useClientPlans } from "@/components/features/subscription/ClientPlans";

const COLUMN_COUNT = 5;

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
  hasActiveFilters = false,
}: EmployerListProps) {
  const t = useTranslations("agentEmployers");
  const tc = useTranslations("common");
  const { data: plans } = useClientPlans(employers.map((em) => em.userId));

  // Same actions as a card. Posting, entering the account and editing need the
  // employer assigned to me; a region-only row can still open its jobs.
  const rowActions = (em: Employer): { quick: RowAction[]; menu: RowAction[] } => {
    const company = em.companyName ?? em.name;
    const viewJobs: RowAction = {
      key: "jobs",
      label: t("cardViewJobsTooltip"),
      icon: ArrowRight,
      href: `/${locale}/agent/jobs?employerId=${em._id}`,
    };
    const remove: RowAction[] = canDelete
      ? [{ key: "delete", label: tc("delete"), icon: Trash2, destructive: true, onSelect: () => onDelete(em._id) }]
      : [];
    const menuActions: RowAction[] = [
      viewJobs,
      {
        key: "switch",
        label: t("cardSwitchWorkspaceAriaLabel", { company }),
        icon: LogIn,
        pending: switchingEmployerId === em._id,
        disabled: switchingEmployerId === em._id || !em.isActive,
        onSelect: () => onSwitch(em._id),
      },
      ...(canUpdate
        ? [{ key: "edit", label: t("cardEditAriaLabel", { company }), icon: Edit2, onSelect: () => onEdit(em) }]
        : []),
      ...remove,
    ];
    if (!em.assignedToMe) return { quick: [], menu: menuActions };
    return {
      quick: [
        { key: "post", label: t("cardPostJobButton"), icon: BriefcaseBusiness, href: `/${locale}/agent/jobs/new?employer=${em._id}` },
      ],
      menu: menuActions,
    };
  };

  // Activity becomes one line: 1 open job · 0 new · 0 hires.
  const activityCell = (em: Employer) => {
    const activity = em.activity ?? NO_ACTIVITY;
    return (
      <span className="text-xs text-muted-foreground">
        {t("activityOpenJobs", { count: activity.openJobs })} · {t("activityNewApplicants", { count: activity.newApplicants })} · {t("activityHires", { count: activity.hires })}
      </span>
    );
  };

  const emptyState = (
    <EmptyState
      title={hasActiveFilters ? t("noResultsTitle") : t("emptyStateTitle")}
      description={hasActiveFilters ? t("noResultsDescription") : t("emptyStateDescription")}
      icon={Building2}
    />
  );

  return (
    <>
    <PhoneRecordList
      className="sm:hidden"
      label={t("heroTitle")}
      loading={loading}
      empty={emptyState}
      items={employers.map((em) => {
        const { quick, menu } = rowActions(em);
        const activity = em.activity ?? NO_ACTIVITY;
        const plan = em.userId ? plans?.get(em.userId) : undefined;
        const facts: React.ReactNode[] = [];
        if (em.industry || em.location) {
          facts.push([em.industry, em.location].filter(Boolean).join(" · "));
        }
        facts.push(
          <span key="activity">
            {t("activityOpenJobs", { count: activity.openJobs })} · {t("activityNewApplicants", { count: activity.newApplicants })} · {t("activityHires", { count: activity.hires })}
          </span>
        );
        return {
          key: em._id,
          leading: <UserAvatar name={em.companyName ?? em.name} email={em.email} className="h-10 w-10" colorful />,
          title: em.companyName ?? em.name,
          subtitle: em.email,
          trailing: <StatusBadge status={em.isActive ? "active" : "inactive"} />,
          // Phone buttons get a 40px touch height; the "view jobs" arrow is a
          // link and stayed 36px, so the footer's icons were mismatched.
          actions: <RowActions name={em.companyName ?? em.name} quick={quick} menu={menu} className="[&>a]:!h-10 [&>a[data-icon-only]]:!w-10" />,
          facts,
          badges: (
            <>
              {em.isAgentVerified && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-status-selected">
                  <Check className="h-3 w-3" aria-hidden="true" />
                  {tc("verified")}
                </span>
              )}
              {!em.assignedToMe && (
                <span
                  title={t("cardRegionOnly")}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                >
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {t("inYourRegion")}
                </span>
              )}
              <ClientPlanChip plan={plan} known={Boolean(plans && em.userId)} />
            </>
          ),
        };
      })}
    />
    <section className="workspace-panel-surface overflow-hidden rounded-2xl max-sm:hidden">
      <div className="overflow-x-auto">
        <TooltipProvider delayDuration={200}>
          <Table data-mobile-table="scroll">
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="min-w-[200px]">{t("exportColumnCompany")}</TableHead>
                <TableHead>{tc("status")}</TableHead>
                <TableHead>
                  <span title={t("activityHint")}>{t("columnActivity")}</span>
                </TableHead>
                {/* Secondary: below 1280px the row keeps company, status and
                    actions; the export carries both fields. */}
                <TableHead className="hidden xl:table-cell">{`${t("exportColumnIndustry")} / ${t("exportColumnLocation")}`}</TableHead>
                <TableHead className="text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={6} cols={COLUMN_COUNT} />
              ) : employers.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={COLUMN_COUNT} className="py-12">
                    <EmptyState
                      title={hasActiveFilters ? t("noResultsTitle") : t("emptyStateTitle")}
                      description={hasActiveFilters ? t("noResultsDescription") : t("emptyStateDescription")}
                      icon={Building2}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                employers.map((em) => {
                  const { quick, menu } = rowActions(em);
                  return (
                    <TableRow key={em._id}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          <UserAvatar name={em.companyName ?? em.name} email={em.email} className="h-9 w-9 shrink-0" colorful />
                          <div className="min-w-0 max-w-[14rem]">
                            <p className="truncate font-medium text-foreground">{em.companyName ?? em.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{em.email}</p>
                            <ClientPlanChip plan={em.userId ? plans?.get(em.userId) : undefined} known={Boolean(plans && em.userId)} />
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
                      <TableCell>{activityCell(em)}</TableCell>
                      <TableCell className="hidden text-muted-foreground xl:table-cell">
                        {/* One wrapper: the phone card lays a cell out as a
                            label/value grid, and two loose spans split across it. */}
                        <div>
                          <span className="block">{em.industry || "—"}</span>
                          <span className="mt-1 block text-xs">{em.location || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
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
    </>
  );
}
