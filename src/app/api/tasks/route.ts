import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { auth } from "@/lib/auth/config";
import type { UserRole } from "@/models/User";

const TASKS_PATH = path.join(process.cwd(), "tasks.json");

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = (session.user as unknown as { role: UserRole }).role;
    if (role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const content = await readFile(TASKS_PATH, "utf-8");
    return NextResponse.json(JSON.parse(content));
  } catch (error) {
    return NextResponse.json({ error: "Failed to read tasks" }, { status: 500 });
  }
}
