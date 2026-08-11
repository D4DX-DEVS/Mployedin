import { withAuth } from "@/lib/auth/withAuth";
import { withSubscription } from "@/lib/subscription/withSubscription";
import { getHandler, createHandler } from "./handlers";

export const GET = withAuth(getHandler);
// The guard is what activates withAuth's read-only sub-role enforcement
// (withAuth.ts:270 only applies it when a resource/action is declared), so a
// guardless write route silently skips it.
export const POST = withAuth(
  withSubscription(createHandler, { type: "limit", feature: "activeJobs" }),
  { resource: "jobs", action: "create" },
);
