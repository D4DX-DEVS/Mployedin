import { assignedTaskRoutes } from "@/lib/agentTasks/routes";

/** Approve or send back a team task the super agent assigned. */
export const PATCH = assignedTaskRoutes("super_agent").REVIEW;
