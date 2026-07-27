import { withAuth } from "@/lib/auth/withAuth";
import { getHandler, patchHandler, deleteHandler } from "./handlers";

export const GET = withAuth(getHandler, { resource: "jobs", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "jobs", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "jobs", action: "delete" });
