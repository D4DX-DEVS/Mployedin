import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import Resource, { RESOURCE_CATEGORIES, RESOURCE_ACCESS_LEVELS } from "@/models/Resource";
import { uploadBuffer, deleteFile, type UploadFolder } from "@/lib/storage/spaces";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_PREFIXES = [
  "image/", "application/pdf", "application/msword",
  "application/vnd.openxmlformats", "application/vnd.ms-",
  "video/", "text/", "application/zip",
  "application/x-zip", "application/octet-stream",
];

async function getHandler(_req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const id = params?.id;

  const item = await Resource.findById(id)
    .populate("uploadedBy", "name")
    .populate("versionHistory.uploadedBy", "name")
    .lean();

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (ctx.role !== "admin") {
    if (!item.isActive) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (item.accessLevel !== "all_staff" && item.accessLevel !== ctx.role) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json(item);
}

async function patchHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Only admin can update resources" }, { status: 403 });
  }

  await connectDB();
  const id = params?.id;

  const item = await Resource.findById(id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const title = formData.get("title") as string | null;
    const description = formData.get("description") as string | null;
    const category = formData.get("category") as string | null;
    const tagsRaw = formData.get("tags") as string | null;
    const accessLevel = formData.get("accessLevel") as string | null;
    const isActive = formData.get("isActive");
    const sortOrder = formData.get("sortOrder");
    const versionNote = formData.get("versionNote") as string | null;

    if (title) item.title = title.trim();
    if (description !== null) item.description = description?.trim();
    if (category && RESOURCE_CATEGORIES.includes(category as never)) item.category = category as typeof item.category;
    if (tagsRaw !== null) item.tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
    if (accessLevel && RESOURCE_ACCESS_LEVELS.includes(accessLevel as never)) item.accessLevel = accessLevel as typeof item.accessLevel;
    if (isActive !== null) item.isActive = isActive === "true";
    if (sortOrder !== null) item.sortOrder = Number(sortOrder);

    const fileEntries = formData.getAll("files");
    const newFiles = [];
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
      newFiles.push({
        fileName: entry.name,
        url: result.url,
        key: result.key,
        contentType: entry.type,
        size: result.size,
      });
    }

    if (newFiles.length > 0) {
      item.files.push(...newFiles);
      item.version = (item.version ?? 1) + 1;
      item.versionHistory.push({
        version: item.version,
        uploadedBy: ctx.userId,
        uploadedAt: new Date(),
        files: newFiles,
        note: versionNote?.trim() ?? `Version ${item.version}`,
      });
    }
  } else {
    const body = await req.json();
    if (body.title) item.title = body.title.trim();
    if (body.description !== undefined) item.description = body.description?.trim();
    if (body.category && RESOURCE_CATEGORIES.includes(body.category)) item.category = body.category;
    if (body.tags !== undefined) item.tags = Array.isArray(body.tags) ? body.tags : [];
    if (body.accessLevel && RESOURCE_ACCESS_LEVELS.includes(body.accessLevel)) item.accessLevel = body.accessLevel;
    if (body.isActive !== undefined) item.isActive = body.isActive;
    if (body.sortOrder !== undefined) item.sortOrder = body.sortOrder;
    if (body.removeFileKeys && Array.isArray(body.removeFileKeys)) {
      for (const key of body.removeFileKeys) {
        try { await deleteFile(key); } catch { /* ignore storage errors */ }
      }
      item.files = item.files.filter(
        (f: { key: string }) => !body.removeFileKeys.includes(f.key),
      );
    }
  }

  await item.save();
  return NextResponse.json(item);
}

/** POST /api/resources/[id]/download — track download count */
async function postHandler(_req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  await Resource.findByIdAndUpdate(params?.id, { $inc: { downloadCount: 1 } });
  return NextResponse.json({ success: true });
}

async function deleteHandler(_req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Only admin can delete resources" }, { status: 403 });
  }

  await connectDB();
  const id = params?.id;

  const item = await Resource.findById(id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  for (const file of item.files) {
    try { await deleteFile(file.key); } catch { /* ignore */ }
  }

  await Resource.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, { resource: "resources", action: "read" });
export const POST = withAuth(postHandler, { resource: "resources", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "resources", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "resources", action: "delete" });
