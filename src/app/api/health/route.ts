import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Lightweight DB ping
    await connectDB();

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      db: "ok",
    });
  } catch {
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        db: "down",
      },
      { status: 503 }
    );
  }
}
