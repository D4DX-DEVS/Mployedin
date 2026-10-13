import { assignedTaskRoutes } from "@/lib/agentTasks/routes";

/** Every agent's assigned tasks: list (GET) and assign (POST). */
const routes = assignedTaskRoutes("admin");
export const GET = routes.GET;
export const POST = routes.POST;
