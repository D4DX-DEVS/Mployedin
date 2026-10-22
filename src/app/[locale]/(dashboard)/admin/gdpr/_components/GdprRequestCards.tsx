"use client";

import { Eye } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import { formatListDate } from "@/lib/ui/intlFormat";
import { RequestStatusBadge } from "./RequestStatusBadge";
import { RequestTypeLabel } from "./RequestTypeLabel";
import type { GdprRequestRow } from "./types";

interface GdprRequestCardsProps {
  requests: readonly GdprRequestRow[];
  onView: (request: GdprRequestRow) => void;
  /** The status moves still open to a request (Start, Reject, Complete). */
  actionsFor: (request: GdprRequestRow) => RowAction[];
}

/** Placeholder cards with the shape of the real ones: avatar and name, type and status, one button. */
export function GdprRequestCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul aria-hidden="true" className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="space-y-3 rounded-xl border border-border/70 bg-card p-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-11 w-24 rounded-xl" />
        </li>
      ))}
    </ul>
  );
}

/**
 * The request list on a phone: one card per request, in three lines. The
 * generic phone table cards put the type label and every button on one flex
 * row, which squeezed "Erasure" to a letter per line beside two buttons.
 *
 *   1. who      avatar, name, e-mail
 *   2. what     type (never shrinks or breaks), status, dates (wrap below it)
 *   3. actions  View and the open status moves; wrap, each at least 44px tall
 */
export function GdprRequestCards({ requests, onView, actionsFor }: GdprRequestCardsProps) {
  const t = useTranslations("adminGdpr");
  const locale = useLocale();
  const date = (value: string) => formatListDate(new Date(value), locale);

  return (
    <ul aria-label={t("dataRequestsTab")} className="space-y-3">
      {requests.map((r) => (
        <li key={r._id} className="min-w-0 rounded-xl border border-border/70 bg-card p-3 shadow-sm shadow-black/[0.04]">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar name={r.userName} email={r.userEmail} className="size-9 shrink-0" colorful />
            <div className="min-w-0 flex-1">
              <p className="break-words font-medium leading-snug text-foreground">{r.userName}</p>
              {/* ltr: an Arabic page would otherwise cut the start of the address. */}
              <p dir="ltr" className="truncate text-xs text-muted-foreground rtl:text-right">{r.userEmail}</p>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <RequestTypeLabel type={r.requestType} />
            <RequestStatusBadge status={r.status} />
          </div>
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>{t("cardSubmittedOn", { date: date(r.createdAt) })}</span>
            {/* completedAt is the decision date of a refusal too (GdprRequest.completedAt). */}
            {r.completedAt && (
              <span>{t(r.status === "rejected" ? "cardRefusedOn" : "cardCompletedOn", { date: date(r.completedAt) })}</span>
            )}
          </p>

          <RowActions
            name={r.userName}
            labelsFrom="always"
            // "flex-flow", not "flex-wrap": the phone filter-chip rule shrinks any button inside a flex-wrap row to 30px.
            className="mt-3 justify-start gap-2 [flex-flow:row_wrap] [&_button]:min-h-11 [&_button]:min-w-11"
            quick={[{ key: "view", label: t("viewButton"), icon: Eye, onSelect: () => onView(r) }]}
            menu={actionsFor(r)}
          />
        </li>
      ))}
    </ul>
  );
}
