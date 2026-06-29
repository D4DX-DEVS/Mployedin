/**
 * GraphQL API Route — graphql-yoga on Next.js App Router
 *
 * POST /api/graphql  — standard GraphQL endpoint
 * GET  /api/graphql  — GraphiQL playground (dev only)
 *
 * Protected: admin role only (returns platform-wide financials + customer PII).
 */

import { createYoga } from "graphql-yoga";
import { useDisableIntrospection } from "@graphql-yoga/plugin-disable-introspection";
import { schema } from "@/lib/graphql/schema";
import { auth } from "@/lib/auth/config";
import connectDB from "@/lib/db/mongoose";
import { NextRequest, NextResponse } from "next/server";

const isProd = process.env.NODE_ENV === "production";

const yoga = createYoga({
  schema,
  graphqlEndpoint: "/api/graphql",
  fetchAPI: { Response },
  // L1: never expose the GraphiQL schema explorer / playground in production.
  graphiql: !isProd,
  // L8: disable raw `__schema` introspection in production. The endpoint is
  // already admin-only (C1), but this is defence-in-depth — an attacker who
  // somehow obtains an admin session cannot dump the full schema (which would
  // accelerate further exploitation). Dev environments keep introspection ON
  // so the developer playground continues to work.
  plugins: isProd ? [useDisableIntrospection()] : [],
});

async function guardAndHandle(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as unknown as { role?: string })?.role;

  // C1: subscriptionDashboard aggregates platform-wide revenue + customer PII with NO
  // tenant scoping. Restrict to admin only — a super_agent must not see other
  // territories' financials/customers. The only consumers are admin dashboard pages.
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  return yoga.fetch(req, {}) as Promise<Response>;
}

export async function GET(req: NextRequest) {
  return guardAndHandle(req);
}

export async function POST(req: NextRequest) {
  return guardAndHandle(req);
}
