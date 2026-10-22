import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { searchTaskLinkOptions } from "@/lib/agentTasks/links";
import { taskLinkTypeSchema } from "@/lib/validators/agent-tasks";

/**
 * GET ?type=candidate|job|employer&q=&jobId=&employerId=
 * The New task form's record pickers: up to 20 records of one kind the agent
 * may link to a task (lib/agentTasks/links.ts decides which). `jobId` narrows
 * candidates to that job's applicants; `employerId` narrows jobs to that
 * employer's.
 */
async function getHandler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const type = taskLinkTypeSchema.safeParse(url.searchParams.get("type"));
  if (!type.success) {
    return NextResponse.json({ error: "type must be candidate, job or employer" }, { status: 400 });
  }
  await connectDB();
  const options = await searchTaskLinkOptions(ctx, type.data, url.searchParams.get("q") ?? "", {
    jobId: url.searchParams.get("jobId") ?? undefined,
    employerId: url.searchParams.get("employerId") ?? undefined,
  });
  return NextResponse.json({ options });
}

export const GET = withAuth(getHandler);
