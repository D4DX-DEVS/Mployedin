import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import Agent from "@/models/Agent";
import User from "@/models/User";
import mongoose from "mongoose";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10"), 50);
  const search = searchParams.get("search")?.trim();

  // ── Filter params ─────────────────────────────────────────
  const availability = searchParams.get("availability")?.trim();       // immediately | within_month | within_3_months | not_available
  const minProfile = parseInt(searchParams.get("minProfile") ?? "0");
  const maxProfile = parseInt(searchParams.get("maxProfile") ?? "100");
  const skills = searchParams.get("skills")?.split(",").map(s => s.trim()).filter(Boolean);
  const location = searchParams.get("location")?.trim();
  const hasCV = searchParams.get("hasCV");                              // "1" to filter only profiles with CV
  const jobType = searchParams.get("jobType")?.trim();                  // remote | hybrid | onsite | any
  const sort = searchParams.get("sort") ?? "newest";                    // newest | oldest | profile_high | profile_low
  const education = searchParams.get("education")?.trim();              // degree/field keyword filter
  const nationality = searchParams.get("nationality")?.trim();          // nationality filter
  const experienceYears = parseInt(searchParams.get("experienceYears") ?? "0"); // minimum experience years

  // ── Agent scoping — agents with explicit assignments see only their job seekers ───
  let agentScopeFilter: Record<string, unknown> = {};
  if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId })
      .select("assignedJobSeekerIds")
      .lean();
    const assignedIds = (agent?.assignedJobSeekerIds as mongoose.Types.ObjectId[]) ?? [];
    const hasAssignedById = await JobSeeker.exists({ agentId: agent?._id });
    if (assignedIds.length > 0 || hasAssignedById) {
      // Agent has explicit assignments — scope to those
      const orConds: Record<string, unknown>[] = [];
      if (assignedIds.length > 0) orConds.push({ _id: { $in: assignedIds } });
      if (agent?._id) orConds.push({ agentId: agent._id });
      agentScopeFilter = { $or: orConds };
    }
    // else: no explicit assignments — agent sees all job seekers
  }

  // ── Build common filter conditions ────────────────────────
  const filterConditions: Record<string, unknown>[] = [];
  if (Object.keys(agentScopeFilter).length > 0) filterConditions.push(agentScopeFilter);
  if (availability) filterConditions.push({ availabilityStatus: availability });
  if (minProfile > 0 || maxProfile < 100) {
    filterConditions.push({ profileCompleteness: { $gte: minProfile, $lte: maxProfile } });
  }
  if (skills && skills.length > 0) {
    filterConditions.push({ skills: { $in: skills.map(s => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")) } });
  }
  if (hasCV === "1") filterConditions.push({ "cv.originalUrl": { $exists: true, $ne: "" } });
  if (jobType) filterConditions.push({ preferredJobType: jobType });
  if (education) {
    // Education synonym expansion — ONLY spelling variants of the same degree, not related degrees
    const EDU_SYNONYMS: Record<string, string[]> = {
      btech: ["b[.\\-\\s]?tech", "btech"],
      mtech: ["m[.\\-\\s]?tech", "mtech"],
      bachelor: ["bachelor", "bachelors"],
      master: ["master", "masters"],
      mba: ["mba", "m\\.?b\\.?a"],
      phd: ["ph[.\\-\\s]?d", "phd", "doctorate", "doctoral"],
      diploma: ["diploma", "dip"],
      bsc: ["b[.\\-\\s]?sc", "bsc"],
      msc: ["m[.\\-\\s]?sc", "msc"],
      be: ["b[.\\-\\s]?e", "be"],
      me: ["m[.\\-\\s]?e", "me"],
      bcom: ["b[.\\-\\s]?com", "bcom"],
      mcom: ["m[.\\-\\s]?com", "mcom"],
      bca: ["b[.\\-\\s]?c[.\\-\\s]?a", "bca"],
      mca: ["m[.\\-\\s]?c[.\\-\\s]?a", "mca"],
      bba: ["b[.\\-\\s]?b[.\\-\\s]?a", "bba"],
      engineering: ["engineering", "engg"],
    };

    const eduTerms = education.split(/\s+/).filter(Boolean);
    const fieldTerms: string[] = []; // e.g. "computer science"
    const degreeRegexParts: string[] = [];

    for (const term of eduTerms) {
      // Normalize: remove dots, hyphens, spaces for synonym lookup (e.g. "b.tech" → "btech", "b-tech" → "btech")
      const lower = term.toLowerCase().replace(/[.\-\s]/g, "");
      const synonyms = EDU_SYNONYMS[lower];
      if (synonyms) {
        // This is a degree term — expand with synonyms
        degreeRegexParts.push(`(${synonyms.join("|")})`);
      } else {
        // This is a field/subject term
        fieldTerms.push(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      }
    }

    // If we have degree synonyms, match any of them in degree field
    if (degreeRegexParts.length > 0) {
      const degreeRegex = degreeRegexParts.join("|");
      filterConditions.push({
        $or: [
          { "education.degree": { $regex: degreeRegex, $options: "i" } },
          { "education.field": { $regex: degreeRegex, $options: "i" } },
        ],
      });
    }

    // If we have field terms (e.g. "computer", "science"), match them in degree/field/institution
    if (fieldTerms.length > 0) {
      for (const ft of fieldTerms) {
        filterConditions.push({
          $or: [
            { "education.degree": { $regex: ft, $options: "i" } },
            { "education.field": { $regex: ft, $options: "i" } },
            { "education.institution": { $regex: ft, $options: "i" } },
          ],
        });
      }
    }

    // Fallback: if no synonym match and no field terms, just regex the whole string
    if (degreeRegexParts.length === 0 && fieldTerms.length === 0) {
      const escapedEdu = education.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filterConditions.push({
        $or: [
          { "education.degree": { $regex: escapedEdu, $options: "i" } },
          { "education.field": { $regex: escapedEdu, $options: "i" } },
          { "education.institution": { $regex: escapedEdu, $options: "i" } },
        ],
      });
    }
  }
  if (nationality) {
    const escapedNat = nationality.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filterConditions.push({ nationality: { $regex: escapedNat, $options: "i" } });
  }
  if (experienceYears > 0) {
    filterConditions.push({ totalExperienceYears: { $gte: experienceYears } });
  }

  // ── Sort option ───────────────────────────────────────────
  const sortMap: Record<string, Record<string, 1 | -1>> = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    profile_high: { profileCompleteness: -1 },
    profile_low: { profileCompleteness: 1 },
  };
  const sortOption = sortMap[sort] ?? sortMap.newest;

  if (search || location) {
    const escapedSearch = search ? search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
    const escapedLocation = location ? location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";

    // Build search match conditions
    const searchConditions: Record<string, unknown>[] = [];
    if (escapedSearch) {
      searchConditions.push({
        $or: [
          { "userId.name": { $regex: escapedSearch, $options: "i" } },
          { "userId.email": { $regex: escapedSearch, $options: "i" } },
          { fullName: { $regex: escapedSearch, $options: "i" } },
          { skills: { $regex: escapedSearch, $options: "i" } },
          { currentLocation: { $regex: escapedSearch, $options: "i" } },
          { "experience.jobTitle": { $regex: escapedSearch, $options: "i" } },
          { headline: { $regex: escapedSearch, $options: "i" } },
          { "education.degree": { $regex: escapedSearch, $options: "i" } },
          { "education.field": { $regex: escapedSearch, $options: "i" } },
          { nationality: { $regex: escapedSearch, $options: "i" } },
        ],
      });
    }
    if (escapedLocation) {
      searchConditions.push({
        $or: [
          { currentLocation: { $regex: escapedLocation, $options: "i" } },
          { preferredLocations: { $regex: escapedLocation, $options: "i" } },
        ],
      });
    }

    const allConditions = [...filterConditions, ...searchConditions];

    const pipeline = [
      // Pre-filter before $lookup for agent scope + field filters
      ...(filterConditions.length > 0 ? [{ $match: { $and: filterConditions } }] : []),
      { $lookup: { from: User.collection.name, localField: "userId", foreignField: "_id", as: "userId" } },
      { $unwind: { path: "$userId", preserveNullAndEmptyArrays: true } },
      // Text-based search (needs userId to be joined)
      ...(searchConditions.length > 0 ? [{ $match: { $and: searchConditions } }] : []),
      {
        $project: {
          "userId._id": 1, "userId.name": 1, "userId.email": 1,
          fullName: 1, email: 1, phone: 1, headline: 1, summary: 1,
          nationality: 1, status: 1,
          skills: 1, currentLocation: 1, experience: 1, education: 1,
          languages: 1, certifications: 1,
          profileCompleteness: 1, availabilityStatus: 1, badges: 1,
          totalExperienceYears: 1, preferredJobType: 1,
          preferredLocations: 1,
          "cv.originalUrl": 1,
          createdAt: 1,
        },
      },
      { $sort: sortOption as Record<string, 1 | -1> },
      {
        $facet: {
          items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          count: [{ $count: "total" }],
        },
      },
    ];

    const [result] = await JobSeeker.aggregate(pipeline);
    const items = result?.items ?? [];
    const total = result?.count?.[0]?.total ?? 0;
    return NextResponse.json({ items, total, page, totalPages: Math.ceil(total / limit) });
  }

  // No search — simple find + populate
  const baseFilter = filterConditions.length > 0 ? { $and: filterConditions } : {};
  const [items, total] = await Promise.all([
    JobSeeker.find(baseFilter)
      .populate("userId", "name email")
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    JobSeeker.countDocuments(baseFilter),
  ]);

  return NextResponse.json({ items, total, page, totalPages: Math.ceil(total / limit) });
}, { resource: "job_seekers", action: "read" });
