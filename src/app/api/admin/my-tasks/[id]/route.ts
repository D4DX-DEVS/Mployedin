import { personalTaskRoutes } from "@/lib/agentTasks/personalRoutes";

/** An admin's own to-do list: one task's history (GET), update (PATCH) and delete (DELETE). */
const routes = personalTaskRoutes("admin");
export const GET = routes.history;
export const PATCH = routes.update;
export const DELETE = routes.remove;
