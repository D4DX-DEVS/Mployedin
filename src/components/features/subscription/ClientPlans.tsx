"use client";

/**
 * Plan information for agents and super agents about their own employers:
 * a plan chip per row and a read-only list of open plan requests. Agents
 * don't approve (admin does) but they sell, so they need to see both.
 */
import { Crown, Inbox } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/currency";
import { formatListDate } from "@/lib/ui/intlFormat";
import type { ClientPlan } from "@/lib/subscription/clientPlan";

export function useClientPlans(userIds: (string | undefined)[]) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))].sort().slice(0, 100);
  return useQuery({
    queryKey: ["client-plans", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, ClientPlan>> => {
      const res = await fetch(`/api/subscriptions/client-plans?userIds=${ids.join(",")}`);
      if (!res.ok) throw new Error("load");
      const data = (await res.json()) as { plans: ClientPlan[] };
      return new Map(data.plans.map((p) => [p.userId, p]));
    },
  });
}

/**
 * "Gold · AED 499" or "No plan" under a company name. `known` is false until
 * the plans have loaded, so a missing answer never reads as "No plan".
 */
export function ClientPlanChip({ plan, known }: { plan: ClientPlan | undefined; known: boolean }) {
  const t = useTranslations("clientPlans");
  if (!known) return null;
  return (
    <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Crown className="size-3 shrink-0" aria-hidden="true" />
      {plan
        ? plan.price > 0
          ? t("chipPaid", { plan: plan.planName, price: formatCurrency(plan.price, plan.currency, "code") })
          : plan.planName
        : t("noPlan")}
    </span>
  );
}

interface RequestRow {
  _id: string;
  customerName: string | null;
  fromPlanName?: string;
  toPlanName: string;
  createdAt: string;
}

/** Open plan requests from this agent's / super agent's employers. Hidden when there are none. */
export function ClientPlanRequests() {
  const t = useTranslations("clientPlans");
  const { data } = useQuery({
    queryKey: ["client-plan-requests"],
    staleTime: 60_000,
    queryFn: async (): Promise<RequestRow[]> => {
      const res = await fetch("/api/subscriptions/upgrade-requests?status=pending&pageSize=10");
      if (!res.ok) return [];
      return ((await res.json()) as { data: RequestRow[] }).data;
    },
  });
  if (!data || data.length === 0) return null;

  return (
    <section aria-labelledby="client-plan-requests" className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <h2 id="client-plan-requests" className="flex items-center gap-2 text-sm font-semibold">
        <Inbox className="size-4 text-amber-600" aria-hidden="true" />
        {t("requestsTitle", { count: data.length })}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("requestsHelp")}</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {data.map((r) => (
          <li key={r._id} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="min-w-0 truncate font-medium">{r.customerName ?? t("deletedAccount")}</span>
            <span className="text-muted-foreground">
              {t("move", { from: r.fromPlanName ?? t("noPlan"), to: r.toPlanName })} · {formatListDate(r.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
