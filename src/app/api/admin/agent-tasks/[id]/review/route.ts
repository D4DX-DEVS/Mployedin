import { assignedTaskRoutes } from "@/lib/agentTasks/routes";

/** Approve or send back any assigned agent task. */
export const PATCH = assignedTaskRoutes("admin").REVIEW;
