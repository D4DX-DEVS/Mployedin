import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { assignedTaskCreateSchema, taskReviewSchema } from "@/lib/validators/agent-tasks";
import { assignTask, listAssignableAgents, listAssignedTasks, reviewTask, TaskError } from "./assigned";

/**
 * The super-agent and admin task routes are the same handlers behind a
 * different role gate; the scope (team vs. every agent) comes from the role
 * inside `assigned.ts`, never from the URL.
 */
type Role = "super_agent" | "admin";

function gate(ctx: AuthContext, role: Role): NextResponse | null {
  return ctx.role === role ? null : NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function fail(err: unknown): NextResponse {
  if (err instanceof TaskError) return NextResponse.json({ error: err.message }, { status: err.status });
  throw err;
}

export function assignedTaskRoutes(role: Role) {
  const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
    const denied = gate(ctx, role);
    if (denied) return denied;
    await connectDB();
    const url = new URL(req.url);
    const page = Math.max(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1), 100);
    const [list, agents] = await Promise.all([
      listAssignedTasks(ctx, {
        status: url.searchParams.get("status") ?? "",
        reviewStatus: url.searchParams.get("review") ?? "",
        agentUserId: url.searchParams.get("agent") ?? "",
        search: url.searchParams.get("search")?.trim() ?? "",
        page,
        limit,
      }),
      // The Assign dialog and the agent filter share one picker list.
      url.searchParams.get("withAgents") === "1" ? listAssignableAgents(ctx) : Promise.resolve(undefined),
    ]);
    return NextResponse.json({ ...list, ...(agents ? { agents } : {}) });
  });

  const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
    const denied = gate(ctx, role);
    if (denied) return denied;
    await connectDB();
    const body = await validateBody(req, assignedTaskCreateSchema);
    try {
      const task = await assignTask(ctx, body);
      return NextResponse.json({ success: true, task }, { status: 201 });
    } catch (err) {
      return fail(err);
    }
  });

  const REVIEW = withAuth(async (req: NextRequest, ctx: AuthContext, params?: Record<string, string>) => {
    const denied = gate(ctx, role);
    if (denied) return denied;
    await connectDB();
    const body = await validateBody(req, taskReviewSchema);
    try {
      const task = await reviewTask(ctx, params?.id ?? "", body.action, body.reviewComment);
      return NextResponse.json({ success: true, task });
    } catch (err) {
      return fail(err);
    }
  });

  return { GET, POST, REVIEW };
}
