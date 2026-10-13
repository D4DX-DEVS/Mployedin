import { assignedTaskRoutes } from "@/lib/agentTasks/routes";

/** A super agent's team tasks: list (GET) and assign (POST). */
const routes = assignedTaskRoutes("super_agent");
export const GET = routes.GET;
export const POST = routes.POST;
