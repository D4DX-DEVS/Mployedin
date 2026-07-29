import { withAuth } from "@/lib/auth/withAuth";
import { getHandler } from "./handlers";

export const GET = withAuth(getHandler, { resource: "jobs", action: "read" });
