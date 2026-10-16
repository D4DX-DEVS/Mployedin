import {
  CheckCheck,
  CheckCircle2,
  CircleDollarSign,
  RotateCcw,
  Undo2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ExhibitionRequestStatus } from "@/models/ExhibitionRequest";
import { ADMIN_NEXT_STEP, adminCanMove } from "@/lib/exhibitions/transitions";

export interface WorkflowActionSpec {
  key: string;
  /** The status this action moves the request to. */
  status: ExhibitionRequestStatus;
  labelKey: string;
  icon: LucideIcon;
  destructive?: boolean;
}

const NEXT_STEP_ICONS: Partial<Record<ExhibitionRequestStatus, LucideIcon>> = {
  approved: CheckCircle2,
  under_review: RotateCcw,
  budget_approved: CircleDollarSign,
  completed: CheckCheck,
};

/**
 * What an admin can do to a request at its current status — the forward step
 * first, then send back and reject — built from the same transition table the
 * API enforces, so nothing offered here comes back as a 400. There is no
 * step back: a wrong amount or detail is corrected in place with Edit.
 */
export function adminWorkflowActions(status: string): {
  next: WorkflowActionSpec | null;
  others: WorkflowActionSpec[];
} {
  const step = ADMIN_NEXT_STEP[status as ExhibitionRequestStatus];
  const next = step
    ? { key: "next", status: step.status, labelKey: step.labelKey, icon: NEXT_STEP_ICONS[step.status] ?? CheckCircle2 }
    : null;

  const others: WorkflowActionSpec[] = [];
  if (adminCanMove(status, "revision_requested")) {
    others.push({ key: "send-back", status: "revision_requested", labelKey: "sendBackButton", icon: Undo2 });
  }
  if (adminCanMove(status, "rejected")) {
    others.push({ key: "reject", status: "rejected", labelKey: "rejectAction", icon: XCircle, destructive: true });
  }
  return { next, others };
}
