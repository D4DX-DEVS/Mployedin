import type { AccountActivity } from "@/lib/agents/accountActivity";

export interface Employer {
  /** The company profile id. */
  _id: string;
  /** The account holder's user id — what /api/employers/[id] takes. */
  userId?: string;
  name: string;
  email: string;
  companyName?: string;
  industry?: string;
  location?: string;
  isActive: boolean;
  isAgentVerified?: boolean;
  /** Assigned to me (not only in my region) — posting jobs and entering the account need it. */
  assignedToMe?: boolean;
  /** Open jobs, the week's new applicants, interviews ahead and hires. */
  activity?: AccountActivity;
}

/** What the table does with a row; the page owns the handlers. */
export interface EmployerListProps {
  employers: Employer[];
  loading: boolean;
  locale: string;
  canUpdate: boolean;
  canDelete: boolean;
  switchingEmployerId: string | null;
  onSwitch: (employerId: string) => void;
  onEdit: (employer: Employer) => void;
  onDelete: (employerId: string) => void;
  /** True when a search/filter is active — shows the "no results" copy (BUG-11). */
  hasActiveFilters?: boolean;
}
