import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import type { AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import { isValidObjectId } from "@/lib/security/sanitize";
import { downloadBuffer } from "@/lib/storage/spaces";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Best-effort MIME guess from the stored CV file extension. */
function guessMime(url: string): string {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".pdf")) return "application/pdf";
  if (clean.endsWith(".docx")) return DOCX_MIME;
  if (clean.endsWith(".doc")) return "application/msword";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

interface SeekerDoc {
  userId: unknown;
  cv?: { originalUrl?: string };
  documents?: Array<{ category?: string; url?: string }>;
}

/**
 * GET /api/employers/candidates/[id]/cv
 *
 * Streams a candidate's CV inline through our own origin so the browser
 * renders it in the in-app viewer instead of downloading it. The stored
 * object lives on a cross-origin CDN that serves `Content-Disposition:
 * attachment`; proxying lets us force `inline` and avoids CSP frame-src /
 * CORS restrictions on the third-party domain.
 *
 * The [id] param is the JobSeeker _id. Employers, agents and admins may view
 * any candidate in the talent pool; job seekers may view their own CV.
 */
async function getHandler(
  _req: NextRequest,
  ctx: AuthContext,
  params?: Record<string, string>,
) {
  const id = params?.id;
  if (!id || !isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid candidate ID" }, { status: 400 });
  }

  await connectDB();

  let seeker: SeekerDoc | null = null;
  if (ctx.role === "job_seeker") {
    // A job seeker may only ever view their own CV; the [id] param is ignored.
    seeker = (await JobSeeker.findOne({ userId: ctx.userId })
      .select("userId cv documents")
      .lean()) as SeekerDoc | null;
  } else if (
    ctx.role === "employer" ||
    ctx.role === "agent" ||
    ctx.role === "super_agent" ||
    ctx.role === "admin"
  ) {
    seeker = (await JobSeeker.findById(id)
      .select("userId cv documents")
      .lean()) as SeekerDoc | null;
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!seeker) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const resumeDoc = seeker.documents?.find((d) => d.category === "resume" && d.url);
  const cvUrl = seeker.cv?.originalUrl || resumeDoc?.url;
  if (!cvUrl) {
    return NextResponse.json(
      { error: "No CV on file for this candidate.", code: "NO_CV" },
      { status: 404 },
    );
  }

  let buffer: Buffer;
  try {
    buffer = await downloadBuffer(cvUrl);
  } catch {
    return NextResponse.json(
      { error: "Could not load the CV file.", code: "DOWNLOAD_FAILED" },
      { status: 502 },
    );
  }

  const mime = guessMime(cvUrl);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const GET = withAuth(getHandler);
