"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CheckCircle2, ClipboardPlus, Download, FileSpreadsheet, FileText, KeyRound, MessageSquare, MoreHorizontal, Pencil, Ban, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AssignTaskDialog } from "@/components/features/tasks/GiveTaskDialog";
import { useConfirm } from "@/hooks/useConfirm";
import { csrfFetch } from "@/lib/security/csrf-client";
import { rangeQuery } from "@/lib/admin/staffReport/range";
import type { StaffReport } from "@/lib/admin/staffReport/types";
import { DateCell, WorkStateBadge } from "./ReportBlocks";

interface ReportHeaderProps {
  report: StaffReport;
  onChanged: () => void;
}

export function reportBasePath(kind: StaffReport["kind"]): string {
  return kind === "super_agent" ? "super-agents" : "agents";
}

/** Who this is, at a glance, and everything admin can do from here. */
export function ReportHeader({ report, onChanged }: ReportHeaderProps) {
  const t = useTranslations("adminStaffReport");
  const locale = useLocale();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [taskOpen, setTaskOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { identity: who, kind } = report;
  const base = reportBasePath(kind);
  const person = [{ userId: who.userId, name: who.name, email: who.email }];
  const download = (format: "pdf" | "csv") =>
    `/api/admin/${base}/${who.userId}/report/download?format=${format}&${rangeQuery(report.range)}&locale=${locale}`;

  const setActive = async (isActive: boolean) => {
    if (!isActive) {
      const ok = await confirm({ message: t("actions.deactivateConfirm", { name: who.name }), confirmLabel: t("actions.deactivate") });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await csrfFetch("/api/admin/users", {
        method: isActive ? "PATCH" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isActive ? { userId: who.userId, isActive: true } : { userId: who.userId }),
      });
      if (!res.ok) throw new Error();
      toast.success(isActive ? t("actions.activated") : t("actions.deactivated"));
      onChanged();
    } catch {
      toast.error(t("actions.couldNotChange"));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    const ok = await confirm({ message: t("actions.resetConfirm", { email: who.email }), confirmLabel: t("actions.resetPassword") });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await csrfFetch("/api/admin/users/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: who.userId }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("actions.resetSent"));
    } catch {
      toast.error(t("actions.couldNotReset"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="workspace-panel-surface flex flex-col gap-4 rounded-2xl p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <UserAvatar name={who.name} email={who.email} src={who.avatar} className="h-12 w-12 shrink-0" colorful />
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold sm:text-xl [overflow-wrap:anywhere]">{who.name}</h1>
            <StatusBadge status={who.isActive ? "active" : "inactive"} />
            {kind === "agent" && <WorkStateBadge state={report.state} />}
            {who.archived && <StatusBadge status="archived" />}
          </div>
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{who.email}{who.phone ? ` · ${who.phone}` : ""}</p>
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <div className="flex gap-1"><dt>{t("header.territory")}:</dt><dd className="text-foreground">{who.regions.join("; ") || t("none")}</dd></div>
            {kind === "super_agent" && (
              <div className="flex gap-1"><dt>{t("header.agents")}:</dt><dd className="text-foreground">{report.tiles.workingAgents?.total ?? 0}</dd></div>
            )}
            {kind === "agent" && (
              <div className="flex gap-1">
                <dt>{t("header.superAgent")}:</dt>
                <dd>
                  {report.superAgent
                    ? <Link href={`/${locale}/admin/super-agents/${report.superAgent.userId}`} className="text-primary hover:underline">{report.superAgent.name}</Link>
                    : <span className="text-foreground">{t("none")}</span>}
                </dd>
              </div>
            )}
            <div className="flex gap-1"><dt>{kind === "super_agent" ? t("header.overrideRate") : t("header.commissionRate")}:</dt><dd className="text-foreground">{report.rate}%</dd></div>
            {kind === "agent" && (
              <div className="flex gap-1"><dt>{t("header.lastActivity")}:</dt><dd><DateCell value={report.lastActivity} /></dd></div>
            )}
            <div className="flex gap-1"><dt>{t("header.lastLogin")}:</dt><dd><DateCell value={who.lastLogin} /></dd></div>
            <div className="flex gap-1"><dt>{t("header.joined")}:</dt><dd><DateCell value={who.createdAt} /></dd></div>
          </dl>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 lg:shrink-0 lg:flex-nowrap">
        <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
          <Link href={`/${locale}/admin/messages?newChat=${who.userId}`}><MessageSquare className="size-4" aria-hidden="true" />{t("actions.message")}</Link>
        </Button>
        <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setTaskOpen(true)}>
          <ClipboardPlus className="size-4" aria-hidden="true" />{t("actions.giveTask")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9"><Download className="size-4" aria-hidden="true" />{t("actions.download")}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><a href={download("pdf")} download><FileText className="size-4" aria-hidden="true" />{t("actions.downloadPdf")}</a></DropdownMenuItem>
            <DropdownMenuItem asChild><a href={download("csv")} download><FileSpreadsheet className="size-4" aria-hidden="true" />{t("actions.downloadCsv")}</a></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9" aria-label={t("actions.more")} disabled={busy}>
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/${locale}/admin/${base}?open=${who.userId}&search=${encodeURIComponent(who.email)}`}><Pencil className="size-4" aria-hidden="true" />{t("actions.edit")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void resetPassword()}><KeyRound className="size-4" aria-hidden="true" />{t("actions.resetPassword")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onChanged}><RefreshCw className="size-4" aria-hidden="true" />{t("actions.refresh")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            {who.isActive ? (
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void setActive(false)}><Ban className="size-4" aria-hidden="true" />{t("actions.deactivate")}</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => void setActive(true)}><CheckCircle2 className="size-4" aria-hidden="true" />{t("actions.activate")}</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AssignTaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        apiBase="/api/admin/agent-tasks"
        agents={kind === "agent" ? person : []}
        superAgents={kind === "super_agent" ? person : undefined}
        presetAgentUserId={kind === "agent" ? who.userId : undefined}
        presetSuperAgentUserId={kind === "super_agent" ? who.userId : undefined}
        onAssigned={onChanged}
      />
      {ConfirmDialogNode}
    </header>
  );
}
