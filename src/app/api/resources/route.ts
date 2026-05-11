import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import Resource from "@/models/Resource";
import { uploadBuffer, type UploadFolder } from "@/lib/storage/spaces";
import { escapeRegex } from "@/lib/security/sanitize";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_PREFIXES = [
  "image/", "application/pdf", "application/msword",
  "application/vnd.openxmlformats", "application/vnd.ms-",
  "video/", "text/", "application/zip",
];

/**
 * GET /api/resources — list resources
 * - Admin: full access
 * - Super Agent / Agent: read-only (downloads)
 */
async function getHandler(req: NextRequest, ctx: AuthContext) {
  // Only admin, super_agent, agent can see resources
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20"));
  const search = searchParams.get("search") ?? "";
  const category = searchParams.get("category") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};

  // Non-admin only sees active resources
  if (ctx.role !== "admin") {
    query.isActive = true;
  }

  if (category) {
    query.category = category;
  }

  if (search) {
    const safe = escapeRegex(search);
    query.$or = [
      { title: new RegExp(safe, "i") },
      { description: new RegExp(safe, "i") },
    ];
  }

  const [items, total] = await Promise.all([
    Resource.find(query)
      .populate("uploadedBy", "name")
      .sort({ sortOrder: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Resource.countDocuments(query),
  ]);

  return NextResponse.json({
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

/**
 * POST /api/resources — upload a new resource (admin only)
 * Expects multipart/form-data with:
 *   title, description, category, files (multiple)
 */
async function postHandler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Only admin can create resources" }, { status: 403 });
  }

  await connectDB();

  const formData = await req.formData();
  const title = formData.get("title") as string;
  const description = formData.get("description") as string | null;
  const category = (formData.get("category") as string) ?? "other";

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  // Process file uploads
  const fileEntries = formData.getAll("files");
  const uploadedFiles = [];

  for (const entry of fileEntries) {
    if (!(entry instanceof File) || entry.size === 0) continue;

    if (entry.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `File ${entry.name} exceeds 50 MB limit` }, { status: 400 });
    }

    // Validate MIME type
    const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) => entry.type.startsWith(prefix));
    if (!isAllowed) {
      return NextResponse.json({ error: `File type ${entry.type} is not allowed` }, { status: 400 });
    }

    const buffer = Buffer.from(await entry.arrayBuffer());
    const result = await uploadBuffer(buffer, {
      folder: "documents" as UploadFolder,
      fileName: entry.name,
      contentType: entry.type,
    });

    uploadedFiles.push({
      fileName: entry.name,
      url: result.url,
      key: result.key,
      contentType: entry.type,
      size: result.size,
    });
  }

  const resource = await Resource.create({
    title: title.trim(),
    description: description?.trim(),
    category,
    files: uploadedFiles,
    uploadedBy: ctx.userId,
  });

  return NextResponse.json(resource, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "resources", action: "read" });
export const POST = withAuth(postHandler, { resource: "resources", action: "create" });
