/**
 * GraphQL API Route — graphql-yoga on Next.js App Router
 *
 * POST /api/graphql  — standard GraphQL endpoint
 * GET  /api/graphql  — GraphiQL playground (dev only)
 *
 * Protected: admin / super_agent roles only.
 */

import { createYoga } from "graphql-yoga";
import { schema } from "@/lib/graphql/schema";
import { auth } from "@/lib/auth/config";
import connectDB from "@/lib/db/mongoose";
import { NextRequest, NextResponse } from "next/server";

const yoga = createYoga({
  schema,
  graphqlEndpoint: "/api/graphql",
  fetchAPI: { Response },
});

async function guardAndHandle(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as unknown as { role?: string })?.role;

  if (!role || !["admin", "super_agent"].includes(role)) {
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
