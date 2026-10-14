import { getPresignedUrl } from "@/lib/storage/spaces";
import type { IResourceFile, ResourceAccessLevel } from "@/models/Resource";

/**
 * Resource files live in the private "documents" folder (contracts and
 * compliance docs sit beside the posters), so the stored CDN URL answers 403.
 * Every URL the API hands out is a short-lived signed one instead, issued only
 * after the role check below. Signing also works for the older objects that
 * were uploaded public-read, so no migration is needed.
 */

const PREVIEW_URL_TTL_SECONDS = 60 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

interface AccessCheckedResource {
  isActive?: boolean;
  accessLevel?: ResourceAccessLevel | string;
}

/** Admin sees everything; other staff see active resources shared with their role. */
export function canViewResource(item: AccessCheckedResource, role: string): boolean {
  if (role === "admin") return true;
  if (!item.isActive) return false;
  return item.accessLevel === "all_staff" || item.accessLevel === role;
}

async function signFile<T extends Pick<IResourceFile, "key" | "contentType">>(file: T): Promise<T> {
  if (!file?.key) return file;
  try {
    const url = await getPresignedUrl(file.key, PREVIEW_URL_TTL_SECONDS, {
      inline: true,
      contentType: file.contentType || undefined,
    });
    return { ...file, url };
  } catch {
    return file;
  }
}

interface ResourceWithFiles {
  files?: IResourceFile[];
  versionHistory?: { files?: IResourceFile[] }[];
}

/** Replace every stored file URL with a signed inline (preview) URL. */
export async function withSignedFileUrls<T extends ResourceWithFiles>(item: T): Promise<T> {
  const [files, versionHistory] = await Promise.all([
    Promise.all((item.files ?? []).map(signFile)),
    item.versionHistory
      ? Promise.all(item.versionHistory.map(async (v) => ({
          ...v,
          files: await Promise.all((v.files ?? []).map(signFile)),
        })))
      : Promise.resolve(undefined),
  ]);
  return { ...item, files, ...(versionHistory && { versionHistory }) };
}

/** Signed URL that downloads the file under its original name. */
export function signedDownloadUrl(file: Pick<IResourceFile, "key" | "fileName">): Promise<string> {
  return getPresignedUrl(file.key, DOWNLOAD_URL_TTL_SECONDS, { downloadName: file.fileName });
}
