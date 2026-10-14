import BackgroundCheck from "@/models/BackgroundCheck";
import { getCheckHistory, startedAt, type CheckHistoryEntry } from "./history";
import { viewerFlags, type CheckActor, type StoredCheckState, type ViewerFlags } from "./workflow";
import type { CheckPerson } from "./people";

/**
 * One check as the detail panel shows it, for either side. The employer's
 * internal notes travel only when `includeNotes` is set — agents run the
 * check from the referees' details and their own findings, never from them.
 */

const PERSON = "name email role";

export interface CheckDetail {
  check: Record<string, unknown>;
  history: CheckHistoryEntry[];
  startedAt: string | null;
  viewer: ViewerFlags;
  assignable: CheckPerson[];
}

interface LoadOptions {
  filter: Record<string, unknown>;
  actor: CheckActor;
  includeNotes: boolean;
  assignable?: CheckPerson[];
}

export async function loadCheckDetail({ filter, actor, includeNotes, assignable = [] }: LoadOptions): Promise<CheckDetail | null> {
  const query = BackgroundCheck.findOne(filter)
    .populate({ path: "jobSeekerId", select: "fullName userId", populate: { path: "userId", select: "name" } })
    .populate({ path: "jobId", select: "title" })
    .populate({ path: "employerId", select: "companyName" })
    .populate({ path: "applicationId", select: "status" })
    .populate({ path: "assignedTo", select: PERSON })
    .populate({ path: "verifiedBy", select: PERSON })
    .populate({ path: "createdBy", select: PERSON });
  if (!includeNotes) query.select("-backgroundNotes");
  const check = (await query.lean()) as (Record<string, unknown> & StoredCheckState) | null;
  if (!check) return null;

  const history = await getCheckHistory(String(check._id));
  return {
    check,
    history,
    startedAt: startedAt(history),
    viewer: viewerFlags(check, actor),
    assignable: viewerFlags(check, actor).canAssign ? assignable : [],
  };
}
