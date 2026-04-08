import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import { z } from "zod";
import { validateBody } from "@/lib/validators";

const autoApplySchema = z.object({
  enabled: z.boolean(),
});

/**
 * PATCH /api/user/autoapply
 *
 * Toggles the current job seeker's auto-apply mode.
 * When enabled: triggers the Inngest autoApply function.
 *
 * TODO: DISABLED — auto-apply feature is planned for future release.
 */
export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  // Feature disabled — return early
  return NextResponse.json({ error: "Auto-apply feature is not yet available" }, { status: 503 });

  // TODO: Re-enable when auto-apply feature is ready
  // if (ctx.role !== "job_seeker") {
  //   return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // }
  //
  // const body = await validateBody(req, autoApplySchema);
  // await connectDB();
  //
  // const seeker = await JobSeeker.findOneAndUpdate(
  //   { userId: ctx.userId },
  //   { applicationMode: body.enabled ? "auto" : "manual" },
  //   { new: true, select: "applicationMode autoApplyCount" }
  // ).lean();
  //
  // if (!seeker) {
  //   return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  // }
  //
  // // Trigger Inngest auto-apply when enabling
  // if (body.enabled) {
  //   try {
  //     const { inngest } = await import("@/lib/inngest/client");
  //     await inngest.send({
  //       name: "job-seeker/auto-apply.triggered",
  //       data: { userId: ctx.userId, trigger: "preference_update" },
  //     });
  //   } catch {
  //     // Inngest failures don't block the response
  //   }
  // }
  //
  // return NextResponse.json({ autoApply: body.enabled });
});
