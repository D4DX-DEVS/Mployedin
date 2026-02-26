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
  withdrawn: { label: "Withdrawn", className: "bg-gray-100 text-gray-600" },

  // Job statuses
  draft: { label: "Draft", className: "bg-gray-100 text-gray-600" },
  pending_approval: {
    label: "Pending",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  active: {
    label: "Active",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  closed: {
    label: "Closed",
    className: "bg-gray-100 text-gray-600",
  },
  expired: {
    label: "Expired",
    className: "bg-red-100 text-red-600",
  },

  // User / verification
  basic: { label: "Basic", className: "bg-gray-100 text-gray-600" },
  company: {
    label: "Company",
    className: "bg-blue-100 text-blue-700",
  },
  premium: {
    label: "Premium",
    className: "bg-purple-100 text-purple-700",
  },

  // Lead statuses
  new: {
    label: "New",
    className: "bg-blue-100 text-blue-700",
  },
  contacted: {
    label: "Contacted",
    className: "bg-amber-100 text-amber-700",
  },
  interested: {
    label: "Interested",
    className: "bg-green-100 text-green-700",
  },
  negotiating: {
    label: "Negotiating",
    className: "bg-purple-100 text-purple-700",
  },
  converted: {
    label: "Converted",
    className: "status-selected",
  },
  lost: { label: "Lost", className: "status-rejected" },

  // Commission statuses
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-700",
  },
  approved: {
    label: "Approved",
    className: "bg-blue-100 text-blue-700",
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
    className: "bg-gray-100 text-gray-600",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        variant.className,
        className
      )}
    >
      {variant.label}
    </span>
  );
}
