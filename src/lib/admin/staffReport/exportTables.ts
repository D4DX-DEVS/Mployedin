import type { Money, MoneyByStatus, StaffReport } from "./types";

/**
 * The report as plain tables of text, shared by the CSV and PDF downloads so
 * both carry the same columns. Pure; `t` is a translator over the
 * `adminStaffReport` namespace.
 */

export type Translate = (key: string, values?: Record<string, string | number>) => string;

export interface ExportTable {
  /** File-safe name, e.g. "invoices". */
  key: string;
  title: string;
  columns: string[];
  rows: string[][];
  /** Rows there were in all (rows may be capped). */
  total: number;
}

const BOM = String.fromCharCode(0xfeff);
const d = (v?: string | null) => (v ? v.slice(0, 10) : "");
const n = (v: number) => String(Math.round(v * 100) / 100);
const moneyList = (items: Money[]) => items.map((m) => `${m.currency} ${n(m.amount)}`).join("; ");
const label = (t: Translate, group: string, key: string) => {
  const full = `${group}.${key}`;
  const out = t(full);
  return out === full || out.endsWith(full) ? key.replace(/_/g, " ") : out;
};

function moneyRows(t: Translate, who: string, rows: MoneyByStatus[]): string[][] {
  return rows.map((r) => [who, r.currency, n(r.pending), n(r.approved), n(r.paid), n(r.disputed), n(r.total)]);
}

export function exportTables(r: StaffReport, t: Translate): ExportTable[] {
  const sa = r.kind === "super_agent";
  const x = r.tiles;
  const summary: ExportTable = {
    key: "summary",
    title: t("tab.overview"),
    columns: [t("export.measure"), t("export.value")],
    rows: [
      [t("export.person"), r.identity.name],
      [t("export.range"), `${r.range.from ?? t("range.all")} – ${r.range.to}`],
      [t("header.territory"), r.identity.regions.join("; ")],
      [t("tile.jobs"), String(x.jobs.posted)],
      [t("tile.applications"), String(x.applications)],
      [t("tile.hires"), String(x.hires.hired)],
      [t("export.placements"), String(x.hires.placements)],
      ...(x.candidatesMoved !== undefined ? [[t("tile.candidatesMoved"), String(x.candidatesMoved)]] : []),
      [t("tile.invoices"), `${x.invoices.count} (${moneyList(x.invoices.totals)})`],
      [t("tile.receivables"), moneyList(x.receivables.due) || "0"],
      [t("export.overdue"), moneyList(x.receivables.overdue) || "0"],
      [t("tile.subscriptions"), `${x.subscriptions.active} / ${x.subscriptions.employers}`],
      [t("tile.exhibitions"), String(x.exhibitions.total)],
      ...(x.workingAgents ? [[t("tile.workingAgents"), `${x.workingAgents.working} / ${x.workingAgents.total}`]] : []),
      [t("export.commissionOwed"), moneyList(x.commission.owed) || "0"],
      [t("export.commissionPaid"), moneyList(x.commission.paid) || "0"],
      [t("tile.target"), r.target ? `${r.target.overallProgress}% (${t("export.expected")} ${r.target.expectedProgress}%)` : t("tile.noTarget")],
      ...r.gaps.map((g) => [`${t("export.warning")} (${t(`severity.${g.severity}`)})`, t(`gap.${g.key}`, { count: g.value ?? 0 })]),
    ],
    total: 0,
  };
  summary.total = summary.rows.length;

  const tables: ExportTable[] = [summary];
  if (sa && r.team) {
    tables.push({
      key: "agents", title: t("tab.agents"), total: r.team.length,
      columns: [t("col.name"), t("col.state"), t("col.lastActivity"), t("col.region"), t("col.employers"), t("col.jobsPosted"), t("col.candidatesMoved"), t("col.hires"), t("col.commissionOwed"), t("col.tasks")],
      rows: r.team.map((a) => [a.name, t(`state.${a.state}`), d(a.lastActivity), a.regions, String(a.employers), String(a.jobsPosted), String(a.candidatesMoved), String(a.hires), moneyList(a.commissionOwed), `${a.openTasks} (${a.overdueTasks})`]),
    });
  }
  tables.push({
    key: "employers", title: t("tab.employers"), total: r.employers.total,
    columns: [t("col.company"), t("col.agent"), t("col.jobsInRange"), t("col.activeJobs"), t("col.applications"), t("col.hires"), t("col.plan"), t("col.renews")],
    rows: r.employers.rows.map((e) => [e.companyName, e.agentName, String(e.jobs), String(e.activeJobs), String(e.applications), String(e.hires), e.plan ?? t("noPlan"), d(e.renewsAt)]),
  });
  tables.push({
    key: "jobs", title: t("tab.jobs"), total: r.jobs.total,
    columns: [t("col.job"), t("col.company"), t("col.agent"), t("col.status"), t("col.applications"), t("col.hires"), t("col.posted")],
    rows: r.jobs.rows.map((j) => [j.title, j.employerName, j.agentName, label(t, "jobStatus", j.status), String(j.applications), String(j.hires), d(j.createdAt)]),
  });
  if (r.seekers) {
    tables.push({
      key: "candidates", title: t("tab.candidates"), total: r.seekers.total,
      columns: [t("col.name"), t("col.how"), t("col.joined")],
      rows: r.seekers.rows.map((s) => [s.name, t(`how.${s.how}`), d(s.createdAt)]),
    });
  }
  tables.push({
    key: "invoices", title: t("tab.invoices"), total: r.invoices.total,
    columns: [t("col.invoice"), t("col.company"), t("col.agent"), t("col.issued"), t("col.due"), t("currency"), t("col.amount"), t("col.paid"), t("col.balance"), t("col.status")],
    rows: r.invoices.rows.map((i) => [i.number, i.employerName, i.agentName, d(i.issuedAt), d(i.dueDate), i.currency, n(i.amount), n(i.paid), n(i.balance), i.overdue ? t("overdue") : label(t, "invoiceStatus", i.status)]),
  });
  tables.push({
    key: "exhibitions", title: t("tab.exhibitions"), total: r.exhibitions.total,
    columns: [t("col.event"), t("col.agent"), t("col.location"), t("col.starts"), t("currency"), t("col.budget"), t("col.status")],
    rows: r.exhibitions.rows.map((e) => [e.name, e.agentName, e.location, d(e.startDate), e.currency, n(e.budget), label(t, "exStatus", e.status)]),
  });
  const moneyCols = [t("col.earnedBy"), t("currency"), t("money.pending"), t("money.approved"), t("money.paid"), t("money.disputed"), t("money.total")];
  tables.push({
    key: "commission_totals", title: t("export.commissionTotals"), total: 0,
    columns: moneyCols,
    rows: sa
      ? [...moneyRows(t, t("commission.own"), r.commission.own), ...moneyRows(t, t("commission.team"), r.commission.team), ...moneyRows(t, t("commission.combined"), r.commission.combined)]
      : moneyRows(t, r.identity.name, r.commission.own),
  });
  tables[tables.length - 1].total = tables[tables.length - 1].rows.length;
  tables.push({
    key: "commission_lines", title: t("commission.lines"), total: r.commission.lines.total,
    columns: [t("col.earnedBy"), t("col.type"), t("currency"), t("col.amount"), t("col.status"), t("col.date")],
    rows: r.commission.lines.rows.map((c) => [c.earnedBy, label(t, "ctype", c.type), c.currency, n(c.amount), label(t, "commissionStatus", c.status), d(c.createdAt)]),
  });
  tables.push({
    key: "tasks", title: t("tab.tasks"), total: r.tasks.rows.total,
    columns: [t("col.task"), t("col.direction"), t("col.priority"), t("col.status"), t("col.due")],
    rows: r.tasks.rows.rows.map((x) => [x.title, t(`direction.${x.direction}`, { name: x.otherPerson }), label(t, "priority", x.priority), x.overdue ? t("overdue") : label(t, "taskStatus", x.status), d(x.dueDate)]),
  });
  return tables;
}

/** RFC 4180 CSV, with a UTF-8 BOM so Excel opens Arabic correctly. Formula-looking cells are neutralised. */
export function toCsv(table: ExportTable): string {
  const cell = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [table.columns, ...table.rows].map((row) => row.map(cell).join(","));
  return BOM + lines.join("\r\n") + "\r\n";
}
