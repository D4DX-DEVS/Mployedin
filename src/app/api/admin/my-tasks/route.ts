import { personalTaskRoutes } from "@/lib/agentTasks/personalRoutes";

/** An admin's own to-do list: list (GET) and create (POST). Only the owner ever sees a task. */
const routes = personalTaskRoutes("admin");
export const GET = routes.list;
export const POST = routes.create;
