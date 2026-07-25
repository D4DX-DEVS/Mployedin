import { withAuth } from "@/lib/auth/withAuth";
import { withSubscription } from "@/lib/subscription/withSubscription";
import { getHandler, postHandler } from "./handlers";

export const GET = withAuth(
  withSubscription(getHandler, { type: "limit", feature: "applicationsViewed" }),
);
export const POST = withAuth(
  withSubscription(postHandler, { type: "limit", feature: "applicationsSubmitted" }),
);
