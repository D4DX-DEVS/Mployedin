import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import Agent from "@/models/Agent";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import { escapeRegex } from "@/lib/security/sanitize";

/* ------------------------------------------------------------------ */
/*  GET /api/super-agent/job-seekers — Regional job seeker directory   */
/* ------------------------------------------------------------------ */

async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "super_agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 10)));
  const search = url.searchParams.get("search") ?? "";
  const country = url.searchParams.get("country") ?? "";
  const experienceMin = url.searchParams.get("experienceMin") ?? "";

  /* Dual-scoping: team agents + region-based agents */
  const scope = await getSuperAgentScope(ctx.userId);
  const agentIds = scope?.effectiveAgentIds ?? [];

  /* Get job seekers assigned to these agents */
  const agents = await Agent.find({ _id: { $in: agentIds } }).select("assignedJobSeekerIds").lean();
  const seekerIds = agents.flatMap((a: Record<string, unknown>) => (a.assignedJobSeekerIds as string[]) ?? []);

  const filter: Record<string, unknown> = {};

  if (seekerIds.length > 0) {
    filter._id = { $in: seekerIds };
  }

  if (search) {
    const safe = escapeRegex(search);
    filter.$or = [
      { "userId.fullName": { $regex: safe, $options: "i" } },
      { "userId.email": { $regex: safe, $options: "i" } },
      { skills: { $regex: safe, $options: "i" } },
    ];
  }

  if (country && country !== "all") {
    filter.country = country;
  }

  if (experienceMin && experienceMin !== "all") {
    filter.experienceYears = { $gte: Number(experienceMin) };
  }

  const [items, total] = await Promise.all([
    JobSeeker.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("userId", "fullName email phone isActive")
      .lean(),
    JobSeeker.countDocuments(filter),
  ]);

  /* Collect distinct countries for facets */
  const countries = await JobSeeker.distinct("country", seekerIds.length > 0 ? { _id: { $in: seekerIds } } : {});

  const mapped = items.map((s: Record<string, unknown>) => {
    const user = s.userId as Record<string, unknown> | null;
    return {
      _id: String(s._id),
      fullName: user?.fullName ?? "Unknown",
      email: user?.email ?? "",
      phone: user?.phone ?? "",
      country: s.country ?? "",
      city: s.city ?? "",
      currentJobTitle: s.currentJobTitle ?? "",
      experienceYears: s.experienceYears ?? 0,
      profileCompletion: s.profileCompletion ?? 0,
      skills: (s.skills as string[])?.slice(0, 10) ?? [],
      createdAt: s.createdAt,
      isActive: user?.isActive ?? false,
    };
  });

  const activeCount = mapped.filter((m) => m.isActive).length;
  const avgCompletion = mapped.length > 0
    ? Math.round(mapped.reduce((acc, m) => acc + (m.profileCompletion as number), 0) / mapped.length)
    : 0;
  const withExperience = mapped.filter((m) => (m.experienceYears as number) >= 3).length;

  return NextResponse.json({
    items: mapped,
    total,
    countries: countries.filter(Boolean),
    stats: {
      total,
      active: activeCount,
      avgCompletion,
      withExperience,
    },
  });
}

export const GET = withAuth(handler, { resource: "job_seekers", action: "read" });
