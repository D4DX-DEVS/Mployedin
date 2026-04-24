import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import mongoose from "mongoose";

const SavedSearchSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true },
  query: { type: String, required: true },
  filters: {
    location: String,
    jobType: String,
    experienceLevel: String,
    salary: String,
  },
  emailAlert: { type: Boolean, default: true },
  frequency: { type: String, enum: ["daily", "weekly", "never"], default: "weekly" },
  lastNotifiedAt: Date,
  resultCount: { type: Number, default: 0 },
}, { timestamps: true });

const SavedSearch = mongoose.models.SavedSearch || mongoose.model("SavedSearch", SavedSearchSchema);

async function getHandler(req: NextRequest, ctx: AuthContext) {
  await connectDB();
  const items = await SavedSearch.find({ userId: ctx.userId }).sort({ createdAt: -1 }).limit(50).lean();
  return NextResponse.json({
    items: items.map((s: Record<string, unknown>) => ({
      _id: String(s._id),
      name: s.name,
      query: s.query,
      filters: s.filters,
      emailAlert: s.emailAlert,
      frequency: s.frequency,
      lastNotifiedAt: s.lastNotifiedAt,
      resultCount: s.resultCount,
      createdAt: s.createdAt,
    })),
  });
}

async function postHandler(req: NextRequest, ctx: AuthContext) {
  await connectDB();
  const body = await req.json();
  const { name, query, filters, frequency, emailAlert } = body;

  if (!name || !query) {
    return NextResponse.json({ error: "Name and query required" }, { status: 400 });
  }

  // Limit to 20 saved searches per user
  const count = await SavedSearch.countDocuments({ userId: ctx.userId });
  if (count >= 20) {
    return NextResponse.json({ error: "Maximum 20 saved searches allowed" }, { status: 400 });
  }

  const search = await SavedSearch.create({
    userId: ctx.userId,
    name: String(name).trim(),
    query: String(query).trim(),
    filters: filters || {},
    frequency: frequency || "weekly",
    emailAlert: emailAlert !== false,
  });

  return NextResponse.json({ success: true, search });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
