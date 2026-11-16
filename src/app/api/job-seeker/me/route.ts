import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import CvDocument from "@/models/CvDocument";

// GET /api/job-seeker/me — lightweight profile for the apply flow
async function getHandler(_req: NextRequest, ctx: { userId: string; role: string; locale: string }) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const seeker = await JobSeeker.findOne({ userId: ctx.userId })
    .select("fullName phone skills documents cv socialLinks cvDesign preferredCvId")
    .lean();

  if (!seeker) {
    return NextResponse.json({ jobSeeker: null });
  }

  const documents = (seeker.documents ?? []).map((d: { id: string; name: string; category: string; url: string; builtHash?: string }) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    url: d.url,
    // The stored copy of the CV built on Mployedin (see cv/built-cv.ts).
    ...(d.builtHash ? { builtHash: d.builtHash } : {}),
  }));

  // The profile CV's own file name, so the apply form can show which file it
  // is ("Ilyas_CV.pdf") instead of a bare "Profile CV".
  const cvUrl = seeker.cv?.originalUrl ?? null;
  // Best-effort: the name is only shown, so a failed lookup must not fail the form.
  const cvFile = cvUrl
    ? await Promise.resolve()
        .then(() => CvDocument.findOne({ jobSeekerId: seeker._id, fileUrl: cvUrl }).select("fileName").lean<{ fileName?: string }>())
        .catch(() => null)
    : null;

  return NextResponse.json(
    {
      jobSeeker: {
        name: seeker.fullName ?? "",
        phone: seeker.phone ?? "",
        skills: seeker.skills ?? [],
        documents,
        cvUrl,
        cvFileName: cvFile?.fileName ?? null,
        // The builder saves its design with the profile, so a saved design
        // means there is a built CV to offer.
        hasBuiltCv: !!seeker.cvDesign,
        // Chosen on My CVs; the apply screens preselect it (cvChoice.ts).
        preferredCvId: (seeker as { preferredCvId?: string | null }).preferredCvId ?? null,
        socialLinks: (seeker.socialLinks ?? []).map((l: { label: string; url: string }) => ({ label: l.label, url: l.url })),
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export const GET = withAuth(getHandler);
