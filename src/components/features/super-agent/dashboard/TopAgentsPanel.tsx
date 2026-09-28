import Link from "next/link";
import { Trophy } from "lucide-react";
import { Panel } from "@/components/shared/DashboardKit";
import type { TopAgentRow } from "@/lib/superAgent/dashboardData";
import { formatCount } from "@/lib/ui/intlFormat";
import type { SuperAgentHref, SuperAgentTranslator } from "./types";

interface Props {
  rows: readonly TopAgentRow[];
  href: SuperAgentHref;
  t: SuperAgentTranslator;
}

const RANK_STYLE = ["bg-amber-100 text-amber-800", "bg-slate-200 text-slate-700", "bg-orange-100 text-orange-800"];

/**
 * The five most productive agents with the four figures that make up their
 * work — counted live, never from the drifting `Agent.performance` counters.
 * The inline bar mirrors the ranking column: placements, or applications
 * while nobody has placed anyone yet.
 */
export function TopAgentsPanel({ rows, href, t }: Props) {
  const metric: keyof TopAgentRow = rows.some((r) => r.placements > 0) ? "placements" : "applications";
  const max = Math.max(1, ...rows.map((r) => Number(r[metric])));
  const cell = (key: keyof TopAgentRow, extra = "") => `py-2 text-end tabular-nums ${key === metric ? "font-semibold text-foreground" : "text-foreground"} ${extra}`;
  return (
    <Panel
      id="super-agent-top-agents"
      icon={Trophy}
      iconClassName="bg-amber-100 text-amber-900"
      title={t("topAgents.title")}
      subtitle={t("topAgents.description")}
      action={{ href: href("/agents?sortBy=placements&sortOrder=desc"), label: t("sections.leaderboard.viewAll") }}
    >
      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
          <p className="text-sm font-medium text-foreground">{t("leaderboard.emptyTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("leaderboard.emptyDescription")}</p>
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="pb-2 text-start font-medium">{t("topAgents.agent")}</th>
              <th scope="col" className="hidden pb-2 text-end font-medium sm:table-cell">{t("funnel.leads")}</th>
              <th scope="col" className="hidden pb-2 text-end font-medium sm:table-cell">{t("topAgents.jobs")}</th>
              <th scope="col" className="pb-2 text-end font-medium">{t("funnel.applications")}</th>
              <th scope="col" className="pb-2 text-end font-medium">{t("funnel.placements")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((row, i) => (
              <tr key={row.agentId}>
                <td className="py-2 pe-2">
                  <Link href={href(`/agents/${row.agentId}`)} className="flex items-center gap-2 font-medium text-foreground hover:text-primary">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums ${RANK_STYLE[i] ?? "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                    <span className="truncate">{row.name || "—"}</span>
                  </Link>
                  <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((Number(row[metric]) / max) * 100)}%` }} />
                  </span>
                </td>
                <td className={cell("leads", "hidden sm:table-cell")}>{formatCount(row.leads)}</td>
                <td className={cell("jobs", "hidden sm:table-cell")}>{formatCount(row.jobs)}</td>
                <td className={cell("applications")}>{formatCount(row.applications)}</td>
                <td className={cell("placements")}>{formatCount(row.placements)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
