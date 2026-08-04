import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const statusVariants: Record<
  string,
  { labelKey: string; className: string }
> = {
  // Application statuses
  applied: { labelKey: "applied", className: "status-applied" },
  shortlisted: { labelKey: "shortlisted", className: "status-shortlisted" },
  interview_scheduled: {
    labelKey: "interview",
    className: "status-interview",
  },
  selected: { labelKey: "selected", className: "status-selected" },
  offer: { labelKey: "offer", className: "status-premium" },
  hired: { labelKey: "hired", className: "status-active" },
  rejected: { labelKey: "rejected", className: "status-rejected" },
  withdrawn: { labelKey: "withdrawn", className: "status-withdrawn" },

  // Job statuses
  draft: { labelKey: "draft", className: "status-draft" },
  pending_approval: {
    labelKey: "pending",
    className: "status-pending",
  },
  active: {
    labelKey: "active",
    className: "status-active",
  },
  paused: {
    labelKey: "paused",
    className: "status-pending",
  },
  closed: {
    labelKey: "closed",
    className: "status-closed",
  },
  expired: {
    labelKey: "expired",
    className: "status-expired",
  },
  inactive: {
    labelKey: "inactive",
    className: "status-draft",
  },

  // User / verification
  basic: { labelKey: "basic", className: "status-draft" },
  company: {
    labelKey: "company",
    className: "status-applied",
  },
  premium: {
    labelKey: "premium",
    className: "status-premium",
  },

  // Lead statuses
  new: {
    labelKey: "new",
    className: "status-new",
  },
  contacted: {
    labelKey: "contacted",
    className: "status-shortlisted",
  },
  interested: {
    labelKey: "interested",
    className: "status-active",
  },
  negotiating: {
    labelKey: "negotiating",
    className: "status-premium",
  },
  converted: {
    labelKey: "converted",
    className: "status-selected",
  },
  lost: { labelKey: "lost", className: "status-rejected" },

  // Commission statuses
  pending: {
    labelKey: "pending",
    className: "status-pending",
  },
  approved: {
    labelKey: "approved",
    className: "status-applied",
  },
  paid: { labelKey: "paid", className: "status-selected" },
  disputed: { labelKey: "disputed", className: "status-rejected" },
  clawed_back: { labelKey: "clawedBack", className: "status-rejected" },

  // Interview statuses
  scheduled: { labelKey: "scheduled", className: "status-pending" },
  confirmed: { labelKey: "confirmed", className: "status-active" },
  completed: { labelKey: "completed", className: "status-selected" },
  cancelled: { labelKey: "cancelled", className: "status-rejected" },
  rescheduled: { labelKey: "rescheduled", className: "status-shortlisted" },

  // Invoice statuses
  issued: { labelKey: "issued", className: "status-applied" },
  sent: { labelKey: "sent", className: "status-shortlisted" },
  partially_paid: { labelKey: "partiallyPaid", className: "status-pending" },
  overdue: { labelKey: "overdue", className: "status-rejected" },
  void: { labelKey: "void", className: "status-draft" },
  refunded: { labelKey: "refunded", className: "status-withdrawn" },
  credit_note: { labelKey: "creditNote", className: "status-draft" },

  // Generic
  true: { labelKey: "yes", className: "status-selected" },
  false: { labelKey: "no", className: "status-rejected" },
};

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
  size?: "sm" | "md";
}

export function StatusBadge({
  status,
  label,
  className,
  size = "sm",
}: StatusBadgeProps) {
  const t = useTranslations("statusBadge");

  // Records with a missing/empty status (legacy data) get a visible dash
  // instead of an empty pill — and no crash on undefined.
  if (!status) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const variant = statusVariants[status] ?? {
    // Humanize any unmapped enum (e.g. "no_show" -> "No Show") so the
    // raw database value is never shown to the user.
    labelKey: "",
    className: "status-draft",
  };

  const displayLabel =
    label ?? (variant.labelKey ? t(variant.labelKey) :
      status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
        variant.className,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
      {displayLabel}
    </span>
  );
}
