import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { searchTaskLinkOptions } from "./links";
import { taskLinkTypeSchema } from "@/lib/validators/agent-tasks";
import { assigneeLinkCtx, assigneeScope } from "./assigned";
import { isValidObjectId } from "@/lib/security/sanitize";

/**
 * GET ?type=candidate|job|employer&q=&jobId=&employerId=
 * The New task form's record pickers: up to 20 records of one kind the agent
 * may link to a task (lib/agentTasks/links.ts decides which). `jobId` narrows
 * candidates to that job's applicants; `employerId` narrows jobs to that
 * employer's.
 *
 * `forAgent` (super agent / admin, in "Assign task"): search as that agent,
 * so a picked record is one the agent can open. It must be an agent the
 * caller may assign to.
 */
async function getHandler(req: NextRequest, ctx: AuthContext) {
  const url = new URL(req.url);
  const forAgent = url.searchParams.get("forAgent");
  let searchCtx: { userId: string; role: string } = ctx;
  if (forAgent) {
    if (ctx.role !== "admin" && ctx.role !== "super_agent") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!isValidObjectId(forAgent)) {
      return NextResponse.json({ error: "Invalid agent" }, { status: 400 });
    }
    await connectDB();
    const scope = await assigneeScope(ctx);
    if (scope !== "all" && !scope.some((id) => String(id) === forAgent)) {
      return NextResponse.json({ error: "That agent isn't in your team" }, { status: 403 });
    }
    searchCtx = assigneeLinkCtx(forAgent);
  } else if (ctx.role !== "agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const type = taskLinkTypeSchema.safeParse(url.searchParams.get("type"));
  if (!type.success) {
    return NextResponse.json({ error: "type must be candidate, job or employer" }, { status: 400 });
  }
  await connectDB();
  const options = await searchTaskLinkOptions(searchCtx, type.data, url.searchParams.get("q") ?? "", {
    jobId: url.searchParams.get("jobId") ?? undefined,
    employerId: url.searchParams.get("employerId") ?? undefined,
  });
  return NextResponse.json({ options });
}

/** Shared by /api/agent, /api/super-agent and /api/admin task link-options routes. */
export const linkOptionsGET = withAuth(getHandler);
