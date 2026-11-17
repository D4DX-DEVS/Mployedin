import { assignedTaskRoutes } from "@/lib/agentTasks/routes";

/** Withdraw, give to someone else, change the due date, or switch review — on a task this caller gave. */
export const POST = assignedTaskRoutes("super_agent").ACTION;
