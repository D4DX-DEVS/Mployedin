/**
 * GET /api/cron/task-reminders — daily task reminders (lib/agentTasks/reminders.ts):
 * due tomorrow and overdue to the person doing it (in-app), and overdue given
 * tasks to whoever gave them (in-app + email). Each is sent once per task.
 *
 * Cadence: daily at 07:00 UTC (Inngest: scheduled-task-reminders).
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import { runTaskReminders } from "@/lib/agentTasks/reminders";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;
  await connectDB();
  return NextResponse.json(await runTaskReminders());
}
