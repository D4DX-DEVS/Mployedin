"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, ClipboardPlus, FileBarChart, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AssignTaskDialog } from "@/components/features/tasks/GiveTaskDialog";
import type { RowAction } from "@/components/shared/RowActions";
import type { StaffKind, StaffListSignal } from "@/lib/admin/staffReport/types";
import { formatListDate } from "@/lib/ui/intlFormat";
import { WorkStateBadge } from "./ReportBlocks";

/**
 * Extra columns on Admin → Super Agents / Agents (plan v2): warnings badge,
 * working state, last activity, working agents. One request per page of rows.
 */
export function useStaffSignals(kind: StaffKind, userIds: string[]): Map<string, StaffListSignal> {
  const key = userIds.join(",");
  const [map, setMap] = useState<Map<string, StaffListSignal>>(new Map());
  useEffect(() => {
    if (!key) { setMap(new Map()); return; }
    let alive = true;
    fetch(`/api/admin/staff-signals?role=${kind}&ids=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { signals?: StaffListSignal[] } | null) => {
        if (alive) setMap(new Map((d?.signals ?? []).map((s) => [s.userId, s])));
      })
      .catch(() => { if (alive) setMap(new Map()); });
    return () => { alive = false; };
  }, [kind, key]);
  return map;
}

export function WarningsBadge({ signal }: { signal?: StaffListSignal }) {
  const t = useTranslations("adminStaffReport");
  if (!signal || signal.warnings === 0) return null;
  return (
    <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-xs text-amber-800">
      <AlertTriangle className="size-3" aria-hidden="true" />
      {t("list.warnings", { count: signal.warnings })}
    </Badge>
  );
}

/** "4 of 12 working" for a super agent row. */
export function WorkingAgentsText({ signal }: { signal?: StaffListSignal }) {
  const t = useTranslations("adminStaffReport");
  if (!signal?.workingAgents) return null;
  return <span className="text-xs text-muted-foreground">{t("list.workingOf", { working: signal.workingAgents.working, total: signal.workingAgents.total })}</span>;
}

/** Work state + last activity for an agent row (`inline` = one line, under the name). */
export function AgentActivityCell({ signal, inline = false }: { signal?: StaffListSignal; inline?: boolean }) {
  const t = useTranslations("adminStaffReport");
  const locale = useLocale();
  if (!signal) return inline ? null : <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className={inline ? "flex flex-wrap items-center gap-1.5" : "flex flex-col items-start gap-1"}>
      <WorkStateBadge state={signal.state} />
      <span className="text-xs text-muted-foreground">
        {signal.lastActivity ? formatListDate(new Date(signal.lastActivity), locale) : t("list.noRecentActivity")}
      </span>
    </div>
  );
}

interface Person { _id: string; name: string; email: string }

/** View report, Message and Give task for a row's ⋯ menu, plus the task dialog they open. */
export function useStaffRowActions(kind: StaffKind) {
  const t = useTranslations("adminStaffReport");
  const locale = useLocale();
  const [taskFor, setTaskFor] = useState<Person | null>(null);
  const base = kind === "super_agent" ? "super-agents" : "agents";

  const actionsFor = (p: Person): RowAction[] => [
    { key: "report", label: t("actions.viewReport"), icon: FileBarChart, href: `/${locale}/admin/${base}/${p._id}` },
    { key: "message", label: t("actions.message"), icon: MessageSquare, href: `/${locale}/admin/messages?newChat=${p._id}` },
    { key: "task", label: t("actions.giveTask"), icon: ClipboardPlus, onSelect: () => setTaskFor(p) },
  ];

  const person = useMemo(() => (taskFor ? [{ userId: taskFor._id, name: taskFor.name, email: taskFor.email }] : []), [taskFor]);
  const node = (
    <AssignTaskDialog
      open={taskFor !== null}
      onOpenChange={(o) => { if (!o) setTaskFor(null); }}
      apiBase="/api/admin/agent-tasks"
      agents={kind === "agent" ? person : []}
      superAgents={kind === "super_agent" ? person : undefined}
      presetAgentUserId={kind === "agent" ? taskFor?._id : undefined}
      presetSuperAgentUserId={kind === "super_agent" ? taskFor?._id : undefined}
      onAssigned={() => setTaskFor(null)}
    />
  );
  return { actionsFor, node, reportHref: (id: string) => `/${locale}/admin/${base}/${id}` };
}
