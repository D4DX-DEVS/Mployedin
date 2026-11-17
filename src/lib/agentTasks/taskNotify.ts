import SuperAgent from "@/models/SuperAgent";
import User from "@/models/User";
import type { AgentTaskAssigneeRole } from "@/models/AgentTask";
import { notify } from "@/lib/notifications/trigger";

/** Where the person who received a task finds it ("Given to me" tab). */
export function assigneeHome(role: AgentTaskAssigneeRole): string {
  return role === "super_agent" ? "/super-agent/tasks?tab=given" : "/agent/tasks?tab=given";
}

/** Where the giver reviews it ("Tasks I gave" tab). Always carries a query, so callers append with `&`. */
export async function reviewerHome(assignerUserId: string, role: "admin" | "super_agent" | undefined): Promise<string> {
  if (role === "admin") return "/admin/tasks?tab=gave";
  const sa = await SuperAgent.exists({ userId: assignerUserId });
  return sa ? "/super-agent/tasks?tab=gave" : "/admin/tasks?tab=gave";
}

export async function nameOf(userId: string): Promise<string> {
  const u = await User.findById(userId).select("name").lean<{ name?: string }>();
  return u?.name ?? "";
}

interface TaskNotice {
  userId: string;
  actorId?: string;
  title: string;
  message: string;
  link: string;
  titleKey: string;
  bodyKey: string;
  params?: Record<string, string>;
  metadata?: Record<string, unknown>;
  /** Also email it (overdue work you gave, only). */
  sendEmail?: boolean;
}

/** An in-app task notice; a failed send never fails the action that caused it. */
export async function notifyQuietly(notice: TaskNotice): Promise<void> {
  await notify({ type: "system", ...notice }).catch(() => {});
}
