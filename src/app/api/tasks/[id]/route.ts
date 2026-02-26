import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { auth } from "@/lib/auth/config";
import type { UserRole } from "@/models/User";

const TASKS_PATH = path.join(process.cwd(), "tasks.json");

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = (session.user as unknown as { role: UserRole }).role;
    if (role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    const content = await readFile(TASKS_PATH, "utf-8");
    const data = JSON.parse(content);

    let found = false;
    for (const phase of data.phases) {
      const task = phase.tasks.find((t: { id: string }) => t.id === id);
      if (task) {
        Object.assign(task, {
          ...body,
          completedAt: body.status === "completed" ? new Date().toISOString() : task.completedAt,
          verified: body.verified ?? task.verified,
        });
        phase.progress = Math.round(
          (phase.tasks.filter((t: { status: string }) => t.status === "completed").length /
            phase.tasks.length) *
            100
        );
        found = true;
        break;
      }
    }

    if (!found) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await writeFile(TASKS_PATH, JSON.stringify(data, null, 2), "utf-8");

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}
