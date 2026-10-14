import { assignedTaskRoutes } from "@/lib/agentTasks/routes";

/** Activity history of a task in the caller's assigned list. */
export const GET = assignedTaskRoutes("admin").HISTORY;
