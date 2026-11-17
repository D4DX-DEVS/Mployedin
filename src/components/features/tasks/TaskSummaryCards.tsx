"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ListTodo, Send } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatListDate } from "@/lib/ui/intlFormat";

type Audience = "admin" | "super_agent";

const ROUTES: Record<Audience, { own: string; gave: string; page: string }> = {
  admin: { own: "/api/admin/my-tasks", gave: "/api/admin/agent-tasks", page: "/admin/tasks" },
  super_agent: { own: "/api/super-agent/my-tasks", gave: "/api/super-agent/tasks", page: "/super-agent/tasks" },
};

interface OwnData {
  stats: { open: number; overdue: number; dueToday: number; doneThisWeek: number };
  items: Array<{ _id: string; title: string; dueDate?: string }>;
}
interface GaveData {
  stats: { open: number; overdue: number; needsYou: number };
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  return res.ok ? ((await res.json()) as T) : null;
}

function Stat({ label, value, tone, href }: { label: string; value: number; tone?: "danger" | "warning" | "success"; href: string }) {
  const color = tone === "danger" && value > 0 ? "text-red-600" : tone === "warning" && value > 0 ? "text-amber-600" : tone === "success" ? "text-emerald-600" : "text-foreground";
  return (
    <Link href={href} className="min-w-0 rounded-xl border px-3 py-2 transition-colors hover:border-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className={`block text-lg font-semibold tabular-nums sm:text-xl ${color}`}>{value}</span>
      <span className="block truncate text-xs text-muted-foreground">{label}</span>
    </Link>
  );
}

/**
 * Two small dashboard cards for admins and super agents: "My tasks" (their own
 * list: open, due today, overdue, done this week, and the next few due) and
 * "Tasks I gave" (open, waiting for them, overdue). Kept apart so a manager is
 * never told they are behind because someone on their team is.
 */
export function TaskSummaryCards({ audience }: { audience: Audience }) {
  const t = useTranslations("tasksHub");
  const locale = useLocale();
  const r = ROUTES[audience];
  const page = `/${locale}${r.page}`;
  const own = useQuery({
    queryKey: ["task-summary", audience, "own"],
    queryFn: () => getJson<OwnData>(`${r.own}?kind=personal&due=today&limit=3`),
    staleTime: 60_000,
  });
  const gave = useQuery({
    queryKey: ["task-summary", audience, "gave"],
    queryFn: () => getJson<GaveData>(`${r.gave}?limit=1`),
    staleTime: 60_000,
  });

  const card = "workspace-panel-surface flex min-w-0 flex-col gap-3 rounded-2xl p-4";
  const header = (Icon: typeof ListTodo, title: string, href: string) => (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        {title}
      </h2>
      <Link href={href} className="inline-flex min-h-9 items-center gap-1 rounded-md px-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {t("openTasks")}
        <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
      </Link>
    </div>
  );

  return (
    <section aria-label={t("summaryLabel")} className="grid gap-3 sm:gap-4 lg:grid-cols-2">
      <div className={card}>
        {header(ListTodo, t("cardMine"), page)}
        {own.isLoading ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : own.data ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label={t("statOpen")} value={own.data.stats.open} href={`${page}?status=open`} />
              <Stat label={t("statDueToday")} value={own.data.stats.dueToday} tone="warning" href={`${page}?due=today`} />
              <Stat label={t("statOverdue")} value={own.data.stats.overdue} tone="danger" href={`${page}?due=overdue`} />
              <Stat label={t("statDoneWeek")} value={own.data.stats.doneThisWeek} tone="success" href={`${page}?status=completed`} />
            </div>
            {own.data.items.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {own.data.items.map((item) => {
                  const late = item.dueDate && new Date(item.dueDate) < new Date(new Date().setHours(0, 0, 0, 0));
                  return (
                    <li key={item._id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">{item.title}</span>
                      <span className={`shrink-0 text-xs font-semibold ${late ? "text-red-600" : "text-amber-600"}`}>
                        {late ? t("dueLate", { date: item.dueDate ? formatListDate(new Date(item.dueDate)) : "" }) : t("dueToday")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">{t("nothingDue")}</p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{t("summaryError")}</p>
        )}
      </div>

      <div className={card}>
        {header(Send, t("cardGave"), `${page}?tab=gave`)}
        {gave.isLoading ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : gave.data ? (
          <div className="grid grid-cols-3 gap-2">
            <Stat label={t("statOpen")} value={gave.data.stats.open} href={`${page}?tab=gave&status=open`} />
            <Stat label={t("statNeedsYou")} value={gave.data.stats.needsYou} tone="warning" href={`${page}?tab=gave&review=awaiting_review`} />
            <Stat label={t("statOverdue")} value={gave.data.stats.overdue} tone="danger" href={`${page}?tab=gave&status=overdue`} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("summaryError")}</p>
        )}
      </div>
    </section>
  );
}
