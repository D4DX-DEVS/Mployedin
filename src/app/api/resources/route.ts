import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import Resource, { RESOURCE_CATEGORIES, RESOURCE_ACCESS_LEVELS } from "@/models/Resource";
import { uploadBuffer, type UploadFolder } from "@/lib/storage/spaces";
import { escapeRegex } from "@/lib/security/sanitize";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_PREFIXES = [
  "image/", "application/pdf", "application/msword",
  "application/vnd.openxmlformats", "application/vnd.ms-",
  "video/", "text/", "application/zip",
  "application/x-zip", "application/octet-stream",
];

async function getHandler(req: NextRequest, ctx: AuthContext) {
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20"));
  const search = searchParams.get("search") ?? "";
  const category = searchParams.get("category") ?? "";
  const tag = searchParams.get("tag") ?? "";
  const sort = searchParams.get("sort") ?? "newest"; // newest, popular, a-z

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};

  // Non-admin only sees active + their access level
  if (ctx.role !== "admin") {
    query.isActive = true;
    query.accessLevel = { $in: ["all_staff", ctx.role] };
  }

  if (category && RESOURCE_CATEGORIES.includes(category as never)) {
    query.category = category;
  }

  if (tag) {
    query.tags = tag;
  }

  if (search) {
    const safe = escapeRegex(search);
    query.$or = [
      { title: new RegExp(safe, "i") },
      { description: new RegExp(safe, "i") },
      { tags: new RegExp(safe, "i") },
    ];
  }

  let sortQuery: Record<string, 1 | -1> = { createdAt: -1 };
  if (sort === "popular") sortQuery = { downloadCount: -1, createdAt: -1 };
  else if (sort === "a-z") sortQuery = { title: 1 };

  const [items, total] = await Promise.all([
    Resource.find(query)
      .populate("uploadedBy", "name")
      .sort(sortQuery)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Resource.countDocuments(query),
  ]);

  return NextResponse.json({ items, total, page, totalPages: Math.ceil(total / limit) });
}

async function postHandler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Only admin can create resources" }, { status: 403 });
  }

  await connectDB();

  const formData = await req.formData();
  const title = formData.get("title") as string;
  const description = formData.get("description") as string | null;
  const category = (formData.get("category") as string) ?? "other";
  const tagsRaw = formData.get("tags") as string | null;
  const accessLevel = (formData.get("accessLevel") as string) ?? "all_staff";

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  if (!RESOURCE_CATEGORIES.includes(category as never)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  if (!RESOURCE_ACCESS_LEVELS.includes(accessLevel as never)) {
    return NextResponse.json({ error: "Invalid access level" }, { status: 400 });
  }

  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

  const fileEntries = formData.getAll("files");
  const uploadedFiles = [];

  for (const entry of fileEntries) {
    if (!(entry instanceof File) || entry.size === 0) continue;

    if (entry.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `File ${entry.name} exceeds 50 MB limit` }, { status: 400 });
    }

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
    tags,
    files: uploadedFiles,
    uploadedBy: ctx.userId,
    accessLevel,
    version: 1,
    versionHistory: uploadedFiles.length > 0 ? [{
      version: 1,
      uploadedBy: ctx.userId,
      uploadedAt: new Date(),
      files: uploadedFiles,
      note: "Initial upload",
    }] : [],
  });

  return NextResponse.json(resource, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "resources", action: "read" });
export const POST = withAuth(postHandler, { resource: "resources", action: "create" });
