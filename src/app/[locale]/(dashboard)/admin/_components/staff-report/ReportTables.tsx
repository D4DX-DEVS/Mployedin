"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ClipboardPlus, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AssignTaskDialog } from "@/components/features/tasks/GiveTaskDialog";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { StaffReport, TeamAgentRow } from "@/lib/admin/staffReport/types";
import { DateCell, GroupedMoneyTable, MoneyTable, MoneyText, Num, Panel, SimpleTable, WorkStateBadge, useStatusLabel } from "./ReportBlocks";

const money = (n: number, c: string) => <span className="whitespace-nowrap tabular-nums">{formatCurrency(n, c, "code")}</span>;

export function AgentsTab({ report, onChanged }: { report: StaffReport; onChanged: () => void }) {
  const t = useTranslations("adminStaffReport");
  const locale = useLocale();
  const [taskFor, setTaskFor] = useState<TeamAgentRow | null>(null);
  const team = report.team ?? [];
  return (
    <Panel title={t("teamTitle", { count: team.length })}>
      <SimpleTable
        data={{ rows: team, total: team.length }}
        rowKey={(a) => a.userId}
        empty={t("emptyTeam")}
        hrefOf={(a) => `/${locale}/admin/agents/${a.userId}`}
        columns={[
          { key: "name", label: t("col.name"), render: (a) => a.name },
          { key: "state", label: t("col.state"), render: (a) => <WorkStateBadge state={a.state} /> },
          { key: "last", label: t("col.lastActivity"), render: (a) => <DateCell value={a.lastActivity} /> },
          { key: "region", label: t("col.region"), render: (a) => a.regions ? <span className="line-clamp-2 text-xs">{a.regions}</span> : <Badge variant="outline" className="text-amber-700">{t("noRegionShort")}</Badge> },
          { key: "emp", label: t("col.employers"), render: (a) => <Num value={a.employers} />, className: "text-end" },
          { key: "jobs", label: t("col.jobsPosted"), render: (a) => <Num value={a.jobsPosted} />, className: "text-end" },
          { key: "moved", label: t("col.candidatesMoved"), render: (a) => <Num value={a.candidatesMoved} />, className: "text-end" },
          { key: "hires", label: t("col.hires"), render: (a) => <Num value={a.hires} />, className: "text-end" },
          { key: "owed", label: t("col.commissionOwed"), render: (a) => <MoneyText items={a.commissionOwed} />, className: "text-end" },
          { key: "tasks", label: t("col.tasks"), render: (a) => a.overdueTasks > 0 ? <span className="text-destructive">{t("tasksOverdue", { open: a.openTasks, overdue: a.overdueTasks })}</span> : <Num value={a.openTasks} />, className: "text-end" },
          {
            key: "act", label: t("col.actions"), className: "text-end",
            render: (a) => (
              <div className="flex justify-end gap-1">
                <Button asChild variant="ghost" size="icon" className="size-11 sm:size-8" aria-label={t("actions.messageName", { name: a.name })}>
                  <Link href={`/${locale}/admin/messages?newChat=${a.userId}`}><MessageSquare className="size-4" aria-hidden="true" /></Link>
                </Button>
                <Button variant="ghost" size="icon" className="size-11 sm:size-8" aria-label={t("actions.giveTaskName", { name: a.name })} onClick={() => setTaskFor(a)}>
                  <ClipboardPlus className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ),
          },
        ]}
      />
      <AssignTaskDialog
        open={taskFor !== null}
        onOpenChange={(o) => { if (!o) setTaskFor(null); }}
        apiBase="/api/admin/agent-tasks"
        agents={taskFor ? [{ userId: taskFor.userId, name: taskFor.name, email: taskFor.email }] : []}
        presetAgentUserId={taskFor?.userId}
        onAssigned={onChanged}
      />
    </Panel>
  );
}

export function EmployersTab({ report }: { report: StaffReport }) {
  const t = useTranslations("adminStaffReport");
  return (
    <Panel title={t("employersTitle", { count: report.employers.total })}>
      <p className="mb-3 text-xs text-muted-foreground">{report.kind === "super_agent" ? t("employersNoteSa") : t("employersNoteAgent")}</p>
      <SimpleTable
        data={report.employers}
        rowKey={(e) => e.id}
        empty={t("emptyEmployers")}
        columns={[
          { key: "name", label: t("col.company"), render: (e) => <span className="font-medium">{e.companyName}</span> },
          ...(report.kind === "super_agent" ? [{ key: "agent", label: t("col.agent"), render: (e: (typeof report.employers.rows)[number]) => e.agentName }] : []),
          { key: "jobs", label: t("col.jobsInRange"), render: (e) => <Num value={e.jobs} />, className: "text-end" },
          { key: "active", label: t("col.activeJobs"), render: (e) => <span className={cn(e.isActive && e.activeJobs === 0 && "text-amber-700")}><Num value={e.activeJobs} /></span>, className: "text-end" },
          { key: "apps", label: t("col.applications"), render: (e) => <Num value={e.applications} />, className: "text-end" },
          { key: "hires", label: t("col.hires"), render: (e) => <Num value={e.hires} />, className: "text-end" },
          { key: "plan", label: t("col.plan"), render: (e) => e.plan ? <Badge variant="secondary">{e.plan}</Badge> : <Badge variant="outline" className="text-muted-foreground">{t("noPlan")}</Badge> },
          { key: "renews", label: t("col.renews"), render: (e) => <DateCell value={e.renewsAt} /> },
        ]}
      />
    </Panel>
  );
}

export function JobsTab({ report }: { report: StaffReport }) {
  const t = useTranslations("adminStaffReport");
  const locale = useLocale();
  const label = useStatusLabel();
  return (
    <Panel title={t("jobsTitle", { count: report.jobs.total })}>
      <SimpleTable
        data={report.jobs}
        rowKey={(j) => j.id}
        empty={t("emptyJobs")}
        hrefOf={(j) => `/${locale}/admin/jobs/${j.id}`}
        columns={[
          { key: "title", label: t("col.job"), render: (j) => j.title },
          { key: "emp", label: t("col.company"), render: (j) => j.employerName },
          ...(report.kind === "super_agent" ? [{ key: "agent", label: t("col.agent"), render: (j: (typeof report.jobs.rows)[number]) => j.agentName }] : []),
          { key: "status", label: t("col.status"), render: (j) => <Badge variant="outline">{label("jobStatus", j.status)}</Badge> },
          { key: "apps", label: t("col.applications"), render: (j) => <Num value={j.applications} />, className: "text-end" },
          { key: "hires", label: t("col.hires"), render: (j) => <Num value={j.hires} />, className: "text-end" },
          { key: "posted", label: t("col.posted"), render: (j) => <DateCell value={j.createdAt} /> },
        ]}
      />
    </Panel>
  );
}

export function InvoicesTab({ report }: { report: StaffReport }) {
  const t = useTranslations("adminStaffReport");
  const label = useStatusLabel();
  return (
    <Panel title={t("invoicesTitle", { count: report.invoices.total })}>
      <SimpleTable
        data={report.invoices}
        rowKey={(i) => i.id}
        empty={t("emptyInvoices")}
        columns={[
          { key: "no", label: t("col.invoice"), render: (i) => <span className="font-medium">{i.number}</span> },
          { key: "emp", label: t("col.company"), render: (i) => i.employerName },
          ...(report.kind === "super_agent" ? [{ key: "agent", label: t("col.agent"), render: (i: (typeof report.invoices.rows)[number]) => i.agentName }] : []),
          { key: "issued", label: t("col.issued"), render: (i) => <DateCell value={i.issuedAt} /> },
          { key: "due", label: t("col.due"), render: (i) => <span className={cn(i.overdue && "text-destructive")}><DateCell value={i.dueDate} /></span> },
          { key: "amount", label: t("col.amount"), render: (i) => money(i.amount, i.currency), className: "text-end" },
          { key: "paid", label: t("col.paid"), render: (i) => money(i.paid, i.currency), className: "text-end" },
          { key: "bal", label: t("col.balance"), render: (i) => <span className={cn(i.overdue && "font-semibold text-destructive")}>{money(i.balance, i.currency)}</span>, className: "text-end" },
          { key: "status", label: t("col.status"), render: (i) => <Badge variant="outline" className={cn(i.overdue && "border-destructive/40 text-destructive")}>{i.overdue ? t("overdue") : label("invoiceStatus", i.status)}</Badge> },
        ]}
      />
    </Panel>
  );
}

export function ExhibitionsTab({ report }: { report: StaffReport }) {
  const t = useTranslations("adminStaffReport");
  const label = useStatusLabel();
  return (
    <Panel title={t("exhibitionsTitle", { count: report.exhibitions.total })}>
      <SimpleTable
        data={report.exhibitions}
        rowKey={(e) => e.id}
        empty={t("emptyExhibitions")}
        columns={[
          { key: "name", label: t("col.event"), render: (e) => <span className="font-medium">{e.name}</span> },
          ...(report.kind === "super_agent" ? [{ key: "agent", label: t("col.agent"), render: (e: (typeof report.exhibitions.rows)[number]) => e.agentName }] : []),
          { key: "where", label: t("col.location"), render: (e) => e.location || "—" },
          { key: "start", label: t("col.starts"), render: (e) => <DateCell value={e.startDate} /> },
          { key: "budget", label: t("col.budget"), render: (e) => money(e.budget, e.currency), className: "text-end" },
          { key: "status", label: t("col.status"), render: (e) => <Badge variant="outline">{label("exStatus", e.status)}</Badge> },
        ]}
      />
    </Panel>
  );
}

export function CommissionTab({ report }: { report: StaffReport }) {
  const t = useTranslations("adminStaffReport");
  const label = useStatusLabel();
  const sa = report.kind === "super_agent";
  return (
    <div className="space-y-4 sm:space-y-6">
      {sa ? (
        <Panel title={t("commission.summary")}>
          <GroupedMoneyTable groups={[
            { label: t("commission.own"), rows: report.commission.own },
            { label: t("commission.team"), rows: report.commission.team },
            { label: t("commission.combined"), rows: report.commission.combined, strong: true },
          ]} />
        </Panel>
      ) : (
        <Panel title={t("commission.agentOwn")}><MoneyTable rows={report.commission.own} /></Panel>
      )}
      <Panel title={t("commission.lines")}>
        {sa && <p className="mb-3 text-xs text-muted-foreground">{t("commission.linesNote")}</p>}
        <SimpleTable
          data={report.commission.lines}
          rowKey={(c) => c.id}
          empty={t("noCommissions")}
          columns={[
            { key: "who", label: t("col.earnedBy"), render: (c) => <span className="font-medium">{c.earnedBy}</span> },
            { key: "type", label: t("col.type"), render: (c) => label("ctype", c.type) },
            { key: "amount", label: t("col.amount"), render: (c) => money(c.amount, c.currency), className: "text-end" },
            { key: "status", label: t("col.status"), render: (c) => <Badge variant="outline">{label("commissionStatus", c.status)}</Badge> },
            { key: "date", label: t("col.date"), render: (c) => <DateCell value={c.createdAt} /> },
          ]}
        />
      </Panel>
    </div>
  );
}

export function TasksTab({ report }: { report: StaffReport }) {
  const t = useTranslations("adminStaffReport");
  const locale = useLocale();
  const label = useStatusLabel();
  return (
    <div className="space-y-4 sm:space-y-6">
      <Panel title={t("tasksTitle")} action={<span className="text-xs text-muted-foreground">{t("tasksSummary", { open: report.tasks.open, overdue: report.tasks.overdue })}</span>}>
        <SimpleTable
          data={report.tasks.rows}
          rowKey={(x) => `${x.direction}-${x.id}`}
          empty={t("emptyTasks")}
          columns={[
            { key: "title", label: t("col.task"), render: (x) => <span className="font-medium">{x.title}</span> },
            { key: "dir", label: t("col.direction"), render: (x) => <Badge variant="secondary">{t(`direction.${x.direction}`, { name: x.otherPerson })}</Badge> },
            { key: "priority", label: t("col.priority"), render: (x) => label("priority", x.priority) },
            { key: "status", label: t("col.status"), render: (x) => <Badge variant="outline" className={cn(x.overdue && "border-destructive/40 text-destructive")}>{x.overdue ? t("overdue") : label("taskStatus", x.status)}</Badge> },
            { key: "due", label: t("col.due"), render: (x) => <DateCell value={x.dueDate} /> },
          ]}
        />
        <p className="mt-3 text-xs"><Link href={`/${locale}/admin/tasks?tab=gave`} className="text-primary hover:underline">{t("allTasksLink")}</Link></p>
      </Panel>
      {report.activity && (
        <Panel title={t("activityTitle")}>
          <SimpleTable
            data={{ rows: report.activity, total: report.activity.length }}
            rowKey={(_, i) => String(i)}
            empty={t("emptyActivity")}
            columns={[
              { key: "action", label: t("col.action"), render: (a) => a.action.replace(/_/g, " ") },
              { key: "target", label: t("col.target"), render: (a) => a.targetType ?? "—" },
              { key: "at", label: t("col.date"), render: (a) => <DateCell value={a.at} /> },
            ]}
          />
        </Panel>
      )}
    </div>
  );
}

export function CandidatesTab({ report }: { report: StaffReport }) {
  const t = useTranslations("adminStaffReport");
  const locale = useLocale();
  if (!report.seekers) return null;
  return (
    <Panel title={t("seekersTitle", { count: report.seekers.total })}>
      <SimpleTable
        data={report.seekers}
        rowKey={(s) => s.id}
        empty={t("emptySeekers")}
        hrefOf={(s) => `/${locale}/admin/job-seekers/${s.id}`}
        columns={[
          { key: "name", label: t("col.name"), render: (s) => s.name },
          { key: "how", label: t("col.how"), render: (s) => <Badge variant="secondary">{t(`how.${s.how}`)}</Badge> },
          { key: "joined", label: t("col.joined"), render: (s) => <DateCell value={s.createdAt} /> },
        ]}
      />
    </Panel>
  );
}
