import { csrfFetch } from "@/lib/security/csrf-client";

export type AttachmentKind = "event" | "completion";

export interface ExhibitionAttachmentView {
  _id: string;
  kind: AttachmentKind;
  fileName: string;
  contentType: string;
  size: number;
  uploadedAt?: string;
  /** Signed, short-lived URL from the API. */
  url: string;
}

/** What each kind accepts — mirrors ATTACHMENT_VALIDATION on the server. */
export const ATTACHMENT_ACCEPT: Record<AttachmentKind, string> = {
  event: "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp",
  completion: "image/jpeg,image/png,image/webp,image/gif",
};

export const ATTACHMENT_MAX_BYTES: Record<AttachmentKind, number> = {
  event: 10 * 1024 * 1024,
  completion: 5 * 1024 * 1024,
};

export const ATTACHMENT_MAX_COUNT: Record<AttachmentKind, number> = { event: 10, completion: 20 };

type UploadResult = { ok: true; attachments: ExhibitionAttachmentView[] } | { ok: false; error?: string };

/** One request for all the files; the server stops at the first it refuses. */
export async function uploadExhibitionFiles(id: string, kind: AttachmentKind, files: File[]): Promise<UploadResult> {
  if (files.length === 0) return { ok: true, attachments: [] };
  const form = new FormData();
  form.set("kind", kind);
  for (const file of files) form.append("files", file);
  try {
    const res = await csrfFetch(`/api/exhibitions/${id}/attachments`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error };
    return { ok: true, attachments: data.attachments ?? [] };
  } catch {
    return { ok: false };
  }
}

export async function removeExhibitionFile(id: string, attachmentId: string): Promise<UploadResult> {
  try {
    const res = await csrfFetch(`/api/exhibitions/${id}/attachments/${attachmentId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error };
    return { ok: true, attachments: data.attachments ?? [] };
  } catch {
    return { ok: false };
  }
}
