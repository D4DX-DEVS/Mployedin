"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Network } from "lucide-react";
import { Button } from "@/components/ui/button";

import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TeamDetailPanel, type TeamPanelSubject } from "./TeamDetailPanel";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { SearchField } from "@/components/shared/SearchField";

type MoneyByCurrency = Record<string, number>;

interface Stats {
  requests: number;
  inReview: number;
  approved: number;
  rejected: number;
  completed: number;
  approvalRate: number;
  expectedLeads: number;
  leadsCollected: number;
  approvedBudget: MoneyByCurrency;
  actualSpend: MoneyByCurrency;
}

export interface TeamRow extends Stats {
  superAgentId: string | null;
  name: string | null;
  email?: string;
  agentCount: number;
  activeAgents: number;
  agents: (Stats & { agentId: string; name: string; email?: string })[];
}

/** Each currency on its own: requests are raised in several, and one sum would be wrong. */
export function formatMoneyByCurrency(money: MoneyByCurrency): string {
  const entries = Object.entries(money).filter(([, amount]) => amount);
  if (entries.length === 0) return "-";
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, amount]) => formatCurrency(amount, code))
    .join(" · ");
}

const initial = (name: string | null) => (name?.trim()?.[0] ?? "?").toUpperCase();

/** Teams shown before "Show more"; the rest come in steps of the same size. */
const PAGE = 10;

const matches = (query: string, ...values: (string | null | undefined)[]) =>
  values.some((value) => value?.toLowerCase().includes(query));

/**
 * The year's exhibitions by hierarchy: one row per super agent with the team's
 * totals, opening onto every agent under them (client feedback 2026-10-15).
 *
 * Built for a hierarchy of a hundred super agents, not twelve (owner,
 * 2026-10-15): teams with requests come first, ten at a time; teams with none
 * fold into one line; inside a team, idle agents fold the same way; and a
 * search finds any super agent or agent, opening their team. The table
 * scrolls inside its card with the header pinned, and clicking a team or an
 * agent opens their detail: the figures, the agents and the latest requests.
 */
export function TeamPerformanceReport({ teams }: { teams: TeamRow[] }) {
  const t = useTranslations("adminExhibitionsAnalytics.teams");
  const key = (team: TeamRow) => team.superAgentId ?? "none";
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [showIdleTeams, setShowIdleTeams] = useState(false);
  const [idleAgentsOpen, setIdleAgentsOpen] = useState<Set<string>>(new Set());
  const q = query.trim().toLowerCase();

  // While searching: the teams whose super agent matches (with every agent),
  // or that hold a matching agent (with just those agents), idle or not.
  const { active, idle, found } = useMemo(() => {
    if (q) {
      const hits = teams.flatMap((team) => {
        const name = team.superAgentId ? team.name : t("noSuperAgent");
        if (matches(q, name, team.email)) return [{ team, agents: team.agents }];
        const agents = team.agents.filter((agent) => matches(q, agent.name, agent.email));
        return agents.length > 0 ? [{ team, agents }] : [];
      });
      return { active: hits, idle: [], found: hits.length };
    }
    const all = teams.map((team) => ({ team, agents: team.agents }));
    return {
      active: all.filter(({ team }) => team.requests > 0),
      idle: all.filter(({ team }) => team.requests === 0),
      found: all.length,
    };
  }, [q, t, teams]);

  const shownActive = active.slice(0, limit);
  const rows = showIdleTeams && shownActive.length === active.length ? [...shownActive, ...idle] : shownActive;
  const hiddenActive = active.length - shownActive.length;
  // A lone team opens by itself; with several, the summary rows come first.
  const [open, setOpen] = useState<Set<string>>(() => new Set(teams.length === 1 ? [key(teams[0])] : []));
  // A search with a handful of hits opens those teams, to show the agent found.
  useEffect(() => {
    if (q && active.length <= PAGE) setOpen(new Set(active.map(({ team }) => key(team))));
  }, [q, active]);
  const isOpen = (team: TeamRow) => open.has(key(team));
  const allOpen = rows.length > 0 && rows.every(({ team }) => isOpen(team));
  const toggle = (id: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleIdleAgents = (id: string) => setIdleAgentsOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const activeTeams = teams.filter((team) => team.requests > 0).length;
  const [subject, setSubject] = useState<TeamPanelSubject | null>(null);
  const openTeam = (team: TeamRow, name: string) => setSubject({
    title: name,
    subtitle: [team.email, t("agentsCount", { count: team.agentCount, active: team.activeAgents })].filter(Boolean).join(" · "),
    stats: team,
    agentIds: team.agents.map((agent) => agent.agentId),
    agents: team.agents,
  });
  const openAgent = (agent: TeamRow["agents"][number], teamName: string) => setSubject({
    title: agent.name || t("unnamed"),
    subtitle: [agent.email, teamName].filter(Boolean).join(" · "),
    stats: agent,
    agentIds: [agent.agentId],
  });

  const rate = (stats: Stats) => (stats.approved + stats.rejected > 0 ? `${stats.approvalRate}%` : "-");
  const leads = (stats: Stats) => (stats.completed > 0 || stats.leadsCollected > 0
    ? t("leadsValue", { collected: stats.leadsCollected, expected: stats.expectedLeads })
    : "-");

  const cells = (stats: Stats, strong: boolean) => {
    const tone = strong ? "font-semibold text-foreground" : "text-foreground";
    return (
      <>
        <TableCell className={cn("whitespace-nowrap text-center tabular-nums", tone)}>{stats.requests}</TableCell>
        <TableCell className={cn("hidden whitespace-nowrap text-center tabular-nums 2xl:table-cell", tone)}>{stats.inReview}</TableCell>
        <TableCell className={cn("whitespace-nowrap text-center tabular-nums", tone)}>{stats.approved}</TableCell>
        <TableCell className={cn("hidden whitespace-nowrap text-center tabular-nums md:table-cell", tone)}>{stats.completed}</TableCell>
        <TableCell className={cn("whitespace-nowrap text-center tabular-nums", tone)}>{rate(stats)}</TableCell>
        <TableCell className={cn("whitespace-nowrap text-center tabular-nums", tone)}>{leads(stats)}</TableCell>
        <TableCell className={cn("whitespace-nowrap text-end tabular-nums", tone)}>{formatMoneyByCurrency(stats.approvedBudget)}</TableCell>
        <TableCell className={cn("hidden whitespace-nowrap text-end tabular-nums 2xl:table-cell", tone)}>{formatMoneyByCurrency(stats.actualSpend)}</TableCell>
      </>
    );
  };

  return (
    <section className="workspace-panel-surface min-w-0 rounded-2xl panel-body">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="heading-section flex items-center gap-2 font-semibold tracking-tight">
            <Network className="h-5 w-5 text-primary" aria-hidden="true" />
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
          {teams.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{t("summary", { active: activeTeams, total: teams.length })}</p>}
        </div>
        {teams.length > 1 && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
            <SearchField
              className="sm:w-72"
              value={query}
              onValueChange={(value) => { setQuery(value); setLimit(PAGE); }}
              placeholder={t("searchPlaceholder")}
              inputClassName="min-h-11 sm:min-h-9"
            />
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 gap-1.5 sm:min-h-9"
              disabled={rows.length === 0}
              onClick={() => setOpen(allOpen ? new Set() : new Set(rows.map(({ team }) => key(team))))}
            >
              {allOpen ? <ChevronsDownUp className="size-4" aria-hidden="true" /> : <ChevronsUpDown className="size-4" aria-hidden="true" />}
              {allOpen ? t("collapseAll") : t("expandAll")}
            </Button>
          </div>
        )}
      </div>

      {teams.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("noTeams")}</div>
      ) : found === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p>{t("noMatch", { query: query.trim() })}</p>
          <Button variant="link" size="sm" onClick={() => setQuery("")}>{t("clearSearch")}</Button>
        </div>
      ) : (
        <>
        {/* Phone: one card per team (figures in a strip, agents as plain lines
            under a divider), as divided rows inside the panel. The grouped table re-flowed by the generic
            table-to-card fallback nested three boxes deep. */}
        <ul className="divide-y divide-border/60 border-t border-border/60 sm:hidden" aria-label={t("title")}>
          {rows.map(({ team, agents }) => {
            const id = key(team);
            const expanded = isOpen(team);
            const name = team.superAgentId ? team.name || t("unnamed") : t("noSuperAgent");
            const working = q ? agents : agents.filter((agent) => agent.requests > 0);
            const idleAgents = q ? [] : agents.filter((agent) => agent.requests === 0);
            const idleOpen = idleAgentsOpen.has(id);
            const figures = [
              { label: t("colRequests"), value: team.requests },
              { label: t("colApproved"), value: team.approved },
              { label: t("colApprovalRate"), value: rate(team) },
              { label: t("colLeads"), value: leads(team) },
            ];
            return (
              <li key={id} className="py-3">
                <button
                  type="button"
                  onClick={() => openTeam(team, name)}
                  aria-label={t("openDetails", { name })}
                  className="flex w-full min-w-0 items-center gap-3 text-start"
                >
                  <span className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full font-semibold",
                    team.superAgentId ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                  )}>
                    {team.superAgentId ? initial(team.name) : "–"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t("agentsCount", { count: team.agentCount, active: team.activeAgents })}
                    </span>
                  </span>
                </button>
                <dl className="mt-2.5 grid grid-cols-4 divide-x divide-border/60 rounded-lg bg-muted/40 py-1.5 text-center rtl:divide-x-reverse">
                  {figures.map((figure) => (
                    <div key={figure.label} className="flex min-w-0 flex-col-reverse px-1">
                      <dt className="truncate text-[11px] text-muted-foreground">{figure.label}</dt>
                      <dd className="truncate text-sm font-semibold tabular-nums text-foreground">{figure.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 flex justify-between gap-2 text-xs text-muted-foreground">
                  <span>{t("colApprovedBudget")}</span>
                  <span className="font-medium tabular-nums text-foreground">{formatMoneyByCurrency(team.approvedBudget)}</span>
                </p>
                {expanded && (
                  <ul className="mt-2 divide-y divide-border/60 border-t border-border/60">
                    {agents.length === 0 && <li className="py-2 text-xs text-muted-foreground">{t("noAgents")}</li>}
                    {[...working, ...(idleOpen ? idleAgents : [])].map((agent) => (
                      <li key={agent.agentId}>
                        <button
                          type="button"
                          onClick={() => openAgent(agent, name)}
                          aria-label={t("openDetails", { name: agent.name || t("unnamed") })}
                          className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 py-1.5 text-start"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">{agent.name || t("unnamed")}</span>
                            {agent.email && <span className="block truncate text-xs text-muted-foreground">{agent.email}</span>}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {agent.requests} · {rate(agent)}
                          </span>
                        </button>
                      </li>
                    ))}
                    {idleAgents.length > 0 && (
                      <li>
                        <button
                          type="button"
                          onClick={() => toggleIdleAgents(id)}
                          aria-expanded={idleOpen}
                          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
                        >
                          <ChevronDown className={cn("size-4 transition-transform", idleOpen && "rotate-180")} aria-hidden="true" />
                          {t(idleOpen ? "hideIdleAgents" : "showIdleAgents", { count: idleAgents.length })}
                        </button>
                      </li>
                    )}
                  </ul>
                )}
                <div className="mt-2.5 border-t border-border/60 pt-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => toggle(id)}
                    aria-expanded={expanded}
                    className="min-h-11 w-full gap-1.5"
                  >
                    <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
                    {t(expanded ? "hideAgents" : "showAgents", { name })}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="scrollbar-none max-h-[36rem] overflow-auto overscroll-contain rounded-xl border border-border/60 max-sm:hidden" data-mobile-table="scroll">
          <table className="w-full caption-bottom border-collapse text-sm">
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="min-w-[13rem]">{t("colTeam")}</TableHead>
                <TableHead className="text-center">{t("colRequests")}</TableHead>
                <TableHead className="hidden text-center 2xl:table-cell">{t("colInReview")}</TableHead>
                <TableHead className="text-center">{t("colApproved")}</TableHead>
                <TableHead className="hidden text-center md:table-cell">{t("colCompleted")}</TableHead>
                <TableHead className="text-center">{t("colApprovalRate")}</TableHead>
                <TableHead className="text-center">{t("colLeads")}</TableHead>
                <TableHead className="text-end">{t("colApprovedBudget")}</TableHead>
                <TableHead className="hidden text-end 2xl:table-cell">{t("colActualSpend")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ team, agents }) => {
                const id = key(team);
                const expanded = isOpen(team);
                const name = team.superAgentId ? team.name || t("unnamed") : t("noSuperAgent");
                // Agents with requests first; idle ones fold into one line
                // (a search lists exactly the agents it found).
                const working = q ? agents : agents.filter((agent) => agent.requests > 0);
                const idleAgents = q ? [] : agents.filter((agent) => agent.requests === 0);
                const idleOpen = idleAgentsOpen.has(id);
                return (
                  <Fragment key={id}>
                    <TableRow className="bg-muted/10">
                      <TableCell>
                        <span className="flex min-w-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggle(id)}
                          aria-expanded={expanded}
                          aria-label={t(expanded ? "hideAgents" : "showAgents", { name })}
                          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted sm:size-8"
                        >
                          <ChevronDown className={cn("size-4 transition-transform", !expanded && "-rotate-90 rtl:rotate-90")} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openTeam(team, name)}
                          aria-label={t("openDetails", { name })}
                          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg text-start hover:text-primary sm:min-h-0"
                        >
                          <span className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-semibold",
                            team.superAgentId ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                          )}>
                            {team.superAgentId ? initial(team.name) : "–"}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-foreground hover:underline">{name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {t("agentsCount", { count: team.agentCount, active: team.activeAgents })}
                            </span>
                          </span>
                        </button>
                        </span>
                      </TableCell>
                      {cells(team, true)}
                    </TableRow>
                    {expanded && agents.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="ps-20 text-sm text-muted-foreground">{t("noAgents")}</TableCell>
                      </TableRow>
                    )}
                    {expanded && [...working, ...(idleOpen ? idleAgents : [])].map((agent) => (
                      <TableRow key={agent.agentId}>
                        <TableCell className="ps-20">
                          <button
                            type="button"
                            onClick={() => openAgent(agent, name)}
                            aria-label={t("openDetails", { name: agent.name || t("unnamed") })}
                            className="block min-h-11 w-full min-w-0 text-start sm:min-h-0"
                          >
                            <span className="block truncate font-medium text-foreground hover:text-primary hover:underline">{agent.name || t("unnamed")}</span>
                            {agent.email && <span className="block truncate text-xs text-muted-foreground">{agent.email}</span>}
                          </button>
                        </TableCell>
                        {cells(agent, false)}
                      </TableRow>
                    ))}
                    {expanded && idleAgents.length > 0 && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={9} className="ps-20">
                          <button
                            type="button"
                            onClick={() => toggleIdleAgents(id)}
                            aria-expanded={idleOpen}
                            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline sm:min-h-0"
                          >
                            <ChevronDown className={cn("size-4 transition-transform", idleOpen && "rotate-180")} aria-hidden="true" />
                            {t(idleOpen ? "hideIdleAgents" : "showIdleAgents", { count: idleAgents.length })}
                          </button>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </table>
        </div>
        </>
      )}
      {(hiddenActive > 0 || idle.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {hiddenActive > 0 && (
            <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setLimit((current) => current + PAGE)}>
              {t("showMore", { count: Math.min(PAGE, hiddenActive), left: hiddenActive })}
            </Button>
          )}
          {hiddenActive === 0 && idle.length > 0 && (
            <button
              type="button"
              onClick={() => setShowIdleTeams((value) => !value)}
              aria-expanded={showIdleTeams}
              className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary hover:underline sm:min-h-0"
            >
              <ChevronDown className={cn("size-4 transition-transform", showIdleTeams && "rotate-180")} aria-hidden="true" />
              {t(showIdleTeams ? "hideIdleTeams" : "showIdleTeams", { count: idle.length })}
            </button>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{t("footnote")}</p>
      <TeamDetailPanel subject={subject} formatMoneyByCurrency={formatMoneyByCurrency} onClose={() => setSubject(null)} />
    </section>
  );
}
