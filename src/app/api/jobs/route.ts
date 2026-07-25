import { withAuth } from "@/lib/auth/withAuth";
import { withSubscription } from "@/lib/subscription/withSubscription";
import { getHandler, createHandler } from "./handlers";

export const GET = withAuth(getHandler);
export const POST = withAuth(
  withSubscription(createHandler, { type: "limit", feature: "activeJobs" }),
);
