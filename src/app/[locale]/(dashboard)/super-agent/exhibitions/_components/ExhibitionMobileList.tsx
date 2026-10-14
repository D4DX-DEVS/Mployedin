"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, Inbox, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { SupportItemChips, type SupportItemView } from "@/components/features/exhibitions/SupportItemsSummary";
import { locationText } from "../_lib/exhibitions";

export interface MobileExhibitionRow {
  _id: string;
  agentId?: { name?: string };
  eventName: string;
  eventCategory: string;
  eventLocation: string;
  country?: string;
  eventStartDate?: string;
  eventEndDate?: string;
  status: string;
  priority: string;
  createdAt: string;
  supportItems?: SupportItemView[];
}

interface ExhibitionMobileListProps<T extends MobileExhibitionRow> {
  items: T[];
  loading: boolean;
  statusLabels: Record<string, string>;
  priorityLabels: Record<string, string>;
  categoryLabels: Record<string, string>;
  statusColors: Record<string, string>;
  priorityColors: Record<string, string>;
  fmtDate: (value?: string) => string;
  onOpen: (item: T) => void;
  renderActions: (item: T) => ReactNode;
}

/**
 * The super-agent queue below 1280px (phones and tablets, where the seven-column
 * table did not fit): one card per request with the same facts
 * in the same places — title, status + priority, exhibition date and created
 * date, agent, requested support as chips — and the actions along the bottom. The
 * desktop table's generic card mode put each card's pieces wherever its
 * columns happened to wrap, and dropped both dates.
 */
export function ExhibitionMobileList<T extends MobileExhibitionRow>({
  items,
  loading,
  statusLabels,
  priorityLabels,
  categoryLabels,
  statusColors,
  priorityColors,
  fmtDate,
  onOpen,
  renderActions,
}: ExhibitionMobileListProps<T>) {
  const t = useTranslations("exhibitions");

  if (loading) {
    return (
      <ul className="grid gap-3 sm:grid-cols-2 xl:hidden" aria-busy="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <li key={index} className="space-y-3 rounded-2xl border border-border/60 p-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-9 w-full" />
          </li>
        ))}
      </ul>
    );
  }

  if (items.length === 0) {
    return (
      <div className="xl:hidden">
        <EmptyState title={t("noExhibitionRequestsFound")} description={t("tryAdjustingFiltersExhibitions")} icon={Inbox} />
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:hidden">
      {items.map((item) => {
        const where = locationText(item);
        const endsLater = item.eventEndDate && item.eventStartDate && item.eventEndDate.slice(0, 10) !== item.eventStartDate.slice(0, 10);
        return (
          <li key={item._id} className="flex h-full flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-sm shadow-black/[0.03]">
            <button
              type="button"
              onClick={() => onOpen(item)}
              className="block w-full text-start"
            >
              <span className="line-clamp-2 text-base font-semibold leading-6 text-foreground">{item.eventName}</span>
              <span className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <span className="truncate">{categoryLabels[item.eventCategory] ?? item.eventCategory}</span>
                {where ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{where}</span>
                  </>
                ) : null}
              </span>
            </button>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Badge className={`${statusColors[item.status] ?? ""} rounded-md px-2 py-0.5 text-[11px] font-semibold`}>
                {statusLabels[item.status] ?? item.status}
              </Badge>
              {priorityLabels[item.priority] && (
                <Badge className={`${priorityColors[item.priority] ?? ""} rounded-md px-2 py-0.5 text-[11px] font-semibold`}>
                  {priorityLabels[item.priority]}
                </Badge>
              )}
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div className="min-w-0">
                <dt className="text-muted-foreground">{t("tableHeaderExhibitionDate")}</dt>
                <dd className="mt-0.5 flex items-center gap-1 font-medium text-foreground">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {item.eventStartDate ? fmtDate(item.eventStartDate) : <span className="font-normal text-muted-foreground">{t("tableNoDate")}</span>}
                </dd>
                {endsLater ? <dd className="text-[11px] text-muted-foreground">{t("tableDateUntil", { date: fmtDate(item.eventEndDate) })}</dd> : null}
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">{t("tableHeaderCreated")}</dt>
                <dd className="mt-0.5 font-medium text-foreground">{fmtDate(item.createdAt)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">{t("tableHeaderAgent")}</dt>
                <dd className="mt-0.5 truncate font-medium text-foreground">{item.agentId?.name ?? "—"}</dd>
              </div>
            </dl>
            {(item.supportItems?.length ?? 0) > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs text-muted-foreground">{t("requestedSupport")}</p>
                <SupportItemChips items={item.supportItems!} max={3} />
              </div>
            )}
            <div className="h-3" aria-hidden="true" />

            <div className="mt-auto flex items-center justify-end gap-2 border-t border-border/60 pt-3">{renderActions(item)}</div>
          </li>
        );
      })}
    </ul>
  );
}
