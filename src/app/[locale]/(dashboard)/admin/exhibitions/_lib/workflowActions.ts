import {
  Archive,
  CheckCheck,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  PlayCircle,
  RotateCcw,
  Undo2,
  UserPlus,
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
  resources_assigned: UserPlus,
  active: PlayCircle,
  completed: CheckCheck,
  archived: Archive,
};

/**
 * What an admin can do to a request at its current status — the forward step
 * first, then the side moves — built from the same transition table the API
 * enforces, so nothing offered here comes back as a 400.
 */
export function adminWorkflowActions(status: string): { next: WorkflowActionSpec | null; others: WorkflowActionSpec[] } {
  const step = ADMIN_NEXT_STEP[status as ExhibitionRequestStatus];
  const next = step
    ? { key: "next", status: step.status, labelKey: step.labelKey, icon: NEXT_STEP_ICONS[step.status] ?? CheckCircle2 }
    : null;

  const others: WorkflowActionSpec[] = [];
  if (status === "submitted" && adminCanMove(status, "under_review")) {
    others.push({ key: "start-review", status: "under_review", labelKey: "startReview", icon: ClipboardCheck });
  }
  if (adminCanMove(status, "revision_requested")) {
    others.push({ key: "send-back", status: "revision_requested", labelKey: "sendBackButton", icon: Undo2 });
  }
  if (adminCanMove(status, "rejected")) {
    others.push({ key: "reject", status: "rejected", labelKey: "rejectAction", icon: XCircle, destructive: true });
  }
  return { next, others };
}
