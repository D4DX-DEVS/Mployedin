import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { auth } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/**
 * Liveness probe.
 *
 * F-14: the detailed body ("database": "ok"/"error", latency) told an
 * unauthenticated caller whether the database was reachable and how slow it was
 * — a free oracle for probing an outage or timing the backend. Load balancers and
 * uptime checks only need the status code, so anonymous callers get 200/503 and
 * nothing else; admins keep the detail they actually use.
 */
export async function GET() {
  const startedAt = Date.now();

  let dbOk = true;
  try {
    await connectDB();
  } catch {
    dbOk = false;
  }

  let isAdmin = false;
  try {
    const session = await auth();
    isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  } catch {
    // An auth failure must never turn the liveness probe itself into an error.
    isAdmin = false;
  }

  const status = dbOk ? 200 : 503;

  if (!isAdmin) {
    return NextResponse.json({ status: dbOk ? "ok" : "error" }, { status, headers: NO_STORE });
  }

  return NextResponse.json(
    {
      status: dbOk ? "ok" : "error",
      checks: { application: "ok", database: dbOk ? "ok" : "error" },
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    { status, headers: NO_STORE },
  );
}
