import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import type { AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody, commonSchemas } from "@/lib/validators";
import { actorFromCtx } from "@/lib/audit/log";
import logger from "@/lib/logger";
import CvExportRecord, { CV_EXPORT_VERSIONS } from "@/models/CvExportRecord";
import { CV_EXPORT_MAX_ITEMS } from "@/lib/cv/cvExportTypes";

const bodySchema = z.object({
  batchId: commonSchemas.objectId,
  items: z
    .array(
      z.object({
        seekerId: commonSchemas.objectId,
        versions: z.array(z.enum(CV_EXPORT_VERSIONS)).min(1).max(2),
      }),
    )
    .min(1)
    // A candidate can appear once per application, so a batch may name a seeker twice.
    .max(CV_EXPORT_MAX_ITEMS),
});

/**
 * POST /api/cv-export/complete   { batchId, items: [{ seekerId, versions }] }
 *
 * The bulk CV export's last step: the browser built the ZIP and names the
 * candidates whose files are in it. Their pending records from the manifest
 * become `done`, which is what "CV already exported" reads.
 *
 * Nothing new is trusted from the request: only rows the manifest already
 * wrote, for this batch and this person, can be confirmed. A seeker the
 * manifest did not clear has no pending row, so naming them changes nothing.
 * CSRF is enforced for every /api POST by the proxy (src/proxy.ts).
 */
async function postHandler(req: NextRequest, ctx: AuthContext) {
  const { batchId, items } = await validateBody(req, bodySchema);
  const actorId = actorFromCtx(ctx).actorId;
  if (!mongoose.isValidObjectId(actorId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await connectDB();
    const batch = new mongoose.Types.ObjectId(batchId);
    const actor = new mongoose.Types.ObjectId(actorId);
    const now = new Date();
    // One update per named item: a seeker listed twice (two applications) confirms two rows.
    const result = await CvExportRecord.bulkWrite(
      items.map((item) => ({
        updateOne: {
          filter: { batchId: batch, actorId: actor, seekerId: new mongoose.Types.ObjectId(item.seekerId), status: "pending" },
          update: { $set: { status: "done", versions: [...new Set(item.versions)], completedAt: now } },
        },
      })),
      { ordered: false },
    );
    return NextResponse.json({ recorded: result.modifiedCount }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    logger.error({ err }, "[cv-export] complete failed");
    return NextResponse.json({ error: "Couldn't record this export. The download itself is not affected." }, { status: 500 });
  }
}

export const POST = withAuth(postHandler);
