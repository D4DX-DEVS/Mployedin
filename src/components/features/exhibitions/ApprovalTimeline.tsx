import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/ui/intlFormat";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TimelineEntry {
  status: string;
  changedAt: string;
  changedBy?: { _id: string; name: string } | string;
  note?: string;
  approverRole?: string;
  statusReason?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

// Keys in the `exhibitions` namespace — the timeline printed English in Arabic.
const STATUS_LABEL_KEYS: Record<string, string> = {
  draft: "statusDraft",
  submitted: "statusSubmitted",
  under_review: "statusUnderReview",
  approved: "statusApproved",
  revision_requested: "statusRevisionRequested",
  rejected: "statusRejected",
  budget_approved: "statusBudgetApproved",
  resources_assigned: "statusResourcesAssigned",
  active: "statusActive",
  completed: "statusCompleted",
  archived: "statusArchived",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  revision_requested: "bg-orange-100 text-orange-800",
  budget_approved: "bg-teal-100 text-teal-800",
  resources_assigned: "bg-indigo-100 text-indigo-800",
  active: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  archived: "bg-slate-100 text-slate-600",
};

const STATUS_DOTS: Record<string, string> = {
  draft: "bg-gray-400",
  submitted: "bg-blue-500",
  under_review: "bg-amber-500",
  approved: "bg-emerald-500",
  revision_requested: "bg-orange-500",
  budget_approved: "bg-teal-500",
  resources_assigned: "bg-indigo-500",
  active: "bg-purple-500",
  completed: "bg-green-500",
  rejected: "bg-red-500",
  archived: "bg-slate-400",
};

const ROLE_LABEL_KEYS: Record<string, string> = {
  agent: "roleAgent",
  super_agent: "roleSuperAgent",
  admin: "roleAdmin",
  system: "roleSystem",
};

const ROLE_COLORS: Record<string, string> = {
  agent: "bg-blue-50 text-blue-700 border-blue-200",
  super_agent: "bg-amber-50 text-amber-700 border-amber-200",
  admin: "bg-purple-50 text-purple-700 border-purple-200",
  system: "bg-gray-50 text-gray-600 border-gray-200",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface ApprovalTimelineProps {
  entries: TimelineEntry[];
}

export function ApprovalTimeline({ entries }: ApprovalTimelineProps) {
  const t = useTranslations("exhibitions");
  const locale = useLocale();
  if (!entries?.length) {
    return (
      <p className="text-xs text-muted-foreground italic">{t("noApprovalHistory")}</p>
    );
  }

  return (
    <ol className="relative space-y-0">
      {entries.map((entry, i) => {
        const isLast = i === entries.length - 1;
        // An unpopulated `changedBy` arrives as a raw ObjectId string. Printing
        // it reads as garbage in the timeline, so fall back to the role badge.
        const rawActor =
          entry.changedBy && typeof entry.changedBy === "object"
            ? entry.changedBy.name
            : typeof entry.changedBy === "string"
            ? entry.changedBy
            : null;
        const actorName = rawActor && /^[a-f0-9]{24}$/i.test(rawActor) ? null : rawActor;
        const role = entry.approverRole ?? "system";
        const reason = (entry.statusReason ?? entry.note ?? "").trim() || null;

        return (
          <li key={i} className="flex gap-3">
            {/* Spine */}
            <div className="flex flex-col items-center">
              <span
                className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background ${STATUS_DOTS[entry.status] ?? "bg-gray-400"}`}
              />
              {!isLast && <div className="mt-1 w-px flex-1 bg-border/60" />}
            </div>

            {/* Content */}
            <div className={`pb-5 min-w-0 flex-1 ${isLast ? "pb-0" : ""}`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  className={`${STATUS_COLORS[entry.status] ?? ""} rounded-md px-2 py-0.5 text-[11px] font-semibold`}
                >
                  {STATUS_LABEL_KEYS[entry.status] ? t(STATUS_LABEL_KEYS[entry.status]) : entry.status}
                </Badge>
                {entry.approverRole && (
                  <span
                    className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${ROLE_COLORS[role] ?? ROLE_COLORS.system}`}
                  >
                    {ROLE_LABEL_KEYS[role] ? t(ROLE_LABEL_KEYS[role]) : role}
                  </span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                {actorName && <span className="font-medium text-foreground">{actorName}</span>}
                <time dateTime={entry.changedAt}>
                  {formatDateTime(entry.changedAt, {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }, locale)}
                </time>
              </div>

              {reason && (
                <p className="mt-1.5 rounded-md border-l-2 border-muted-foreground/30 bg-muted/30 px-2.5 py-1.5 text-xs italic text-muted-foreground">
                  {reason}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
