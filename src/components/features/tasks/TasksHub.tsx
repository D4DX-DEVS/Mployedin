"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Inbox, ListTodo, Send } from "lucide-react";
import { WorkspaceTabs, type WorkspaceTab } from "@/components/shared/WorkspaceTabs";
import { AssignedTasksWorkspace } from "./AssignedTasksWorkspace";
import { PersonalTasksView } from "./PersonalTasksView";

type Audience = "admin" | "super_agent" | "agent";
type Tab = "mine" | "given" | "gave";

/** Which tabs each role has (owner decision 4, 2026-11-17). */
const TABS: Record<Audience, Tab[]> = {
  admin: ["mine", "gave"],
  super_agent: ["mine", "given", "gave"],
  agent: ["mine", "given"],
};

const OWN_API: Record<Audience, { apiBase: string; linkOptionsEndpoint: string }> = {
  admin: { apiBase: "/api/admin/my-tasks", linkOptionsEndpoint: "/api/admin/agent-tasks/link-options" },
  super_agent: { apiBase: "/api/super-agent/my-tasks", linkOptionsEndpoint: "/api/super-agent/tasks/link-options" },
  agent: { apiBase: "/api/agent/tasks", linkOptionsEndpoint: "/api/agent/tasks/link-options" },
};

interface TasksHubProps {
  audience: Audience;
}

/**
 * The one Tasks page for every role: "My tasks" (their own private list),
 * "Given to me" (tasks someone gave them) and "Tasks I gave" (what they gave
 * and its review). The tab lives in the URL (?tab=given / ?tab=gave) so
 * notifications open the right list; the old ?kind=assigned links still land
 * on "Given to me". Switching tab drops the other tab's filters.
 */
export function TasksHub({ audience }: TasksHubProps) {
  const t = useTranslations("tasksHub");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const allowed = TABS[audience];
  const raw = searchParams.get("tab") ?? (searchParams.get("kind") === "assigned" ? "given" : "mine");
  const tab: Tab = (allowed as string[]).includes(raw) ? (raw as Tab) : "mine";

  const labels: Record<Tab, WorkspaceTab> = {
    mine: { key: "mine", label: t("tabMine"), href: pathname, icon: ListTodo, exact: true },
    given: { key: "given", label: t("tabGiven"), href: `${pathname}?tab=given`, icon: Inbox },
    gave: { key: "gave", label: t("tabGave"), href: `${pathname}?tab=gave`, icon: Send },
  };
  const tabRow = <WorkspaceTabs tabs={allowed.map((k) => labels[k])} ariaLabel={t("tabsLabel")} activeKey={tab} />;

  if (tab === "gave" && audience !== "agent") return <AssignedTasksWorkspace audience={audience} tabs={tabRow} />;
  return (
    <PersonalTasksView
      key={tab}
      {...OWN_API[audience]}
      // The dashboard queue and nav badge link ?due=overdue with no tab: they
      // count every overdue task, so that view shows both kinds.
      kind={tab === "given" ? "assigned" : searchParams.get("due") && !searchParams.get("tab") ? undefined : "personal"}
      tabs={tabRow}
      idPrefix={`${audience}-${tab}-tasks`}
    />
  );
}
