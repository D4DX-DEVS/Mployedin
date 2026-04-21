import { cn } from "@/lib/utils";

const statusVariants: Record<
  string,
  { label: string; className: string }
> = {
  // Application statuses
  applied: { label: "Applied", className: "status-applied" },
  shortlisted: { label: "Shortlisted", className: "status-shortlisted" },
  interview_scheduled: {
    label: "Interview",
    className: "status-interview",
  },
  selected: { label: "Selected", className: "status-selected" },
  rejected: { label: "Rejected", className: "status-rejected" },
  withdrawn: { label: "Withdrawn", className: "status-withdrawn" },

  // Job statuses
  draft: { label: "Draft", className: "status-draft" },
  pending_approval: {
    label: "Pending",
    className: "status-pending",
  },
  active: {
    label: "Active",
    className: "status-active",
  },
  paused: {
    label: "Paused",
    className: "status-pending",
  },
  closed: {
    label: "Closed",
    className: "status-closed",
  },
  expired: {
    label: "Expired",
    className: "status-expired",
  },
  inactive: {
    label: "Inactive",
    className: "status-draft",
  },

  // User / verification
  basic: { label: "Basic", className: "status-draft" },
  company: {
    label: "Company",
    className: "status-applied",
  },
  premium: {
    label: "Premium",
    className: "status-premium",
  },

  // Lead statuses
  new: {
    label: "New",
    className: "status-new",
  },
  contacted: {
    label: "Contacted",
    className: "status-shortlisted",
  },
  interested: {
    label: "Interested",
    className: "status-active",
  },
  negotiating: {
    label: "Negotiating",
    className: "status-premium",
  },
  converted: {
    label: "Converted",
    className: "status-selected",
  },
  lost: { label: "Lost", className: "status-rejected" },

  // Commission statuses
  pending: {
    label: "Pending",
    className: "status-pending",
  },
  approved: {
    label: "Approved",
    className: "status-applied",
  },
  paid: { label: "Paid", className: "status-selected" },
  disputed: { label: "Disputed", className: "status-rejected" },

  // Generic
  true: { label: "Yes", className: "status-selected" },
  false: { label: "No", className: "status-rejected" },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
  size?: "sm" | "md";
}

export function StatusBadge({
  status,
  className,
  size = "sm",
}: StatusBadgeProps) {
  const variant = statusVariants[status] ?? {
    label: status,
    className: "status-draft",
  };

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
      {variant.label}
    </span>
  );
}
