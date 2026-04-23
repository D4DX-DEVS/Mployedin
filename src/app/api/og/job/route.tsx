import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import Employer from "@/models/Employer";

export const runtime = "nodejs";

/**
 * GET /api/og/job?id={jobId}
 * Generates a dynamic 1200×630 Open Graph image for job social previews.
 */
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("id");
  if (!jobId) {
    return new Response("Missing job id", { status: 400 });
  }

  try {
    await connectDB();

    const job = await Job.findById(jobId).lean();
    if (!job) {
      return new Response("Job not found", { status: 404 });
    }

    const employer = job.employerId
      ? await Employer.findOne({ userId: job.employerId }).lean()
      : null;

    const companyName = employer?.companyName ?? "Company";
    const logoUrl = employer?.logo;

    const locationStr =
      typeof job.location === "string"
        ? job.location
        : job.location
          ? `${job.location.city ?? ""}${job.location.city && job.location.country ? ", " : ""}${job.location.country ?? ""}`
          : "";

    const salaryStr =
      job.salary?.min || job.salary?.max
        ? `${job.salary.currency ?? "USD"} ${job.salary.min?.toLocaleString() ?? "0"}–${job.salary.max?.toLocaleString() ?? "0"}/${job.salary.period ?? "mo"}`
        : "";

    const skills = (job.requirements?.skills ?? []).slice(0, 4);

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "48px 56px",
            background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {/* Top row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  width={56}
                  height={56}
                  style={{ borderRadius: "12px", objectFit: "contain", background: "rgba(255,255,255,0.1)" }}
                />
              ) : (
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    fontWeight: 700,
                    color: "white",
                  }}
                >
                  {companyName.charAt(0)}
                </div>
              )}
              <span style={{ fontSize: 22, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
                {companyName}
              </span>
            </div>
            <div
              style={{
                background: "#6366f1",
                color: "white",
                padding: "8px 20px",
                borderRadius: "24px",
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              WE&apos;RE HIRING
            </div>
          </div>

          {/* Middle */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: 42, fontWeight: 800, color: "white", lineHeight: 1.2 }}>
              {job.title.length > 50 ? job.title.slice(0, 50) + "…" : job.title}
            </div>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {locationStr && (
                <span
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.9)",
                    padding: "6px 14px",
                    borderRadius: "20px",
                    fontSize: 16,
                  }}
                >
                  📍 {locationStr}
                </span>
              )}
              {salaryStr && (
                <span
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.9)",
                    padding: "6px 14px",
                    borderRadius: "20px",
                    fontSize: 16,
                  }}
                >
                  💰 {salaryStr}
                </span>
              )}
            </div>

            {skills.length > 0 && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {skills.map((skill: string) => (
                  <span
                    key={skill}
                    style={{
                      border: "1px solid rgba(99,102,241,0.4)",
                      background: "rgba(99,102,241,0.15)",
                      color: "rgba(255,255,255,0.8)",
                      padding: "4px 12px",
                      borderRadius: "8px",
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Bottom */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div
              style={{
                background: "#6366f1",
                color: "white",
                padding: "10px 28px",
                borderRadius: "12px",
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              Apply on MPLOYEDIN
            </div>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>
              mployedin.com
            </span>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      },
    );
  } catch {
    return new Response("Error generating image", { status: 500 });
  }
}
