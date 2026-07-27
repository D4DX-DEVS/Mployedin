import { withAuth } from "@/lib/auth/withAuth";
import { getHandler, patchHandler } from "./handlers";

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
