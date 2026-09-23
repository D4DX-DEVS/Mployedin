import { NextRequest, NextResponse } from "next/server";
import logger from "@/lib/logger";

/**
 * The file itself is unacceptable (type, size, content). Retrying the same
 * file will never succeed, so the caller gets the reason as a 400.
 */
export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileValidationError";
  }
}

/**
 * Parse a multipart upload. Next's proxy keeps only the first 10MB of a body,
 * so an oversized upload arrives truncated and `formData()` throws.
 */
export async function readUploadForm(req: NextRequest): Promise<FormData | NextResponse> {
  try {
    return await req.formData();
  } catch {
    return NextResponse.json(
      { error: "The file couldn't be read. Files must be 10MB or smaller." },
      { status: 413 },
    );
  }
}

/** One mapping from an uploadFile() failure to the response every upload route returns. */
export function uploadErrorResponse(err: unknown): NextResponse {
  const code = (err as { Code?: string }).Code ?? (err as { name?: string }).name;
  if (code === "FileValidationError") {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  if (code === "MalwareDetectedError") {
    return NextResponse.json({ error: "File rejected: failed malware scan." }, { status: 422 });
  }
  if (code === "NoSuchBucket") {
    return NextResponse.json(
      { error: "File storage is not configured. Please contact support." },
      { status: 503 },
    );
  }
  logger.error({ err }, "[upload] storage upload failed");
  return NextResponse.json({ error: "Upload failed. Please try again later." }, { status: 500 });
}
