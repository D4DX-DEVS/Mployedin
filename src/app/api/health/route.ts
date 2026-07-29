import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    // Lightweight DB ping
    await connectDB();

    return NextResponse.json(
      {
        status: "ok",
        checks: {
          application: "ok",
          database: "ok",
        },
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        status: "error",
        checks: {
          application: "ok",
          database: "error",
        },
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}
