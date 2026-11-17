import { personalTaskRoutes } from "@/lib/agentTasks/personalRoutes";

/** A super agent's own to-do list: list (GET) and create (POST). Only the owner ever sees a task. */
const routes = personalTaskRoutes("super_agent");
export const GET = routes.list;
export const POST = routes.create;
