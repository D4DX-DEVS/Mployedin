import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import Resource from "@/models/Resource";
import { uploadBuffer, deleteFile, type UploadFolder } from "@/lib/storage/spaces";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_PREFIXES = [
  "image/", "application/pdf", "application/msword",
  "application/vnd.openxmlformats", "application/vnd.ms-",
  "video/", "text/", "application/zip",
];

/**
 * GET /api/resources/[id] — get a single resource
 */
async function getHandler(_req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const id = params?.id;

  const item = await Resource.findById(id)
    .populate("uploadedBy", "name")
    .lean();

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Non-admin can only see active resources
  if (ctx.role !== "admin" && !item.isActive) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(item);
}

/**
 * PATCH /api/resources/[id] — update resource metadata or add files (admin only)
 */
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
    // Handle file uploads + metadata
    const formData = await req.formData();
    const title = formData.get("title") as string | null;
    const description = formData.get("description") as string | null;
    const category = formData.get("category") as string | null;
    const isActive = formData.get("isActive");
    const sortOrder = formData.get("sortOrder");

    if (title) item.title = title.trim();
    if (description !== null) item.description = description?.trim();
    if (category) item.category = category as typeof item.category;
    if (isActive !== null) item.isActive = isActive === "true";
    if (sortOrder !== null) item.sortOrder = Number(sortOrder);

    // Process new file uploads
    const fileEntries = formData.getAll("files");
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
      item.files.push({
        fileName: entry.name,
        url: result.url,
        key: result.key,
        contentType: entry.type,
        size: result.size,
      });
    }
  } else {
    // JSON body for metadata-only updates
    const body = await req.json();
    if (body.title) item.title = body.title.trim();
    if (body.description !== undefined) item.description = body.description?.trim();
    if (body.category) item.category = body.category;
    if (body.isActive !== undefined) item.isActive = body.isActive;
    if (body.sortOrder !== undefined) item.sortOrder = body.sortOrder;
    // Remove files by key
    if (body.removeFileKeys && Array.isArray(body.removeFileKeys)) {
      for (const key of body.removeFileKeys) {
        try { await deleteFile(key); } catch { /* ignore storage errors */ }
      }
      item.files = item.files.filter(
        (f: { key: string }) => !body.removeFileKeys.includes(f.key)
      );
    }
  }

  await item.save();
  return NextResponse.json(item);
}

/**
 * DELETE /api/resources/[id] — delete a resource (admin only)
 */
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

  // Delete files from storage
  for (const file of item.files) {
    try { await deleteFile(file.key); } catch { /* ignore */ }
  }

  await Resource.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, { resource: "resources", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "resources", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "resources", action: "delete" });
