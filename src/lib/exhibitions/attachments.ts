import { getPresignedUrl } from "@/lib/storage/spaces";
import type { ExhibitionAttachmentKind, IExhibitionAttachment } from "@/models/ExhibitionRequest";

/**
 * Exhibition attachments: the agent's event files (client feedback
 * 2026-10-14: "option to upload the attachment file or image related to
 * event") and the photos they add when the event is completed. Both live in
 * the private "documents" folder, so every URL sent to a browser is signed.
 */

/** Per request, per kind. */
export const ATTACHMENT_LIMITS: Record<ExhibitionAttachmentKind, number> = { event: 10, completion: 20 };

/** Upload validation category (src/lib/security/file-validation.ts) per kind. */
export const ATTACHMENT_VALIDATION: Record<ExhibitionAttachmentKind, "cv" | "image"> = {
  // PDF, DOCX, JPEG, PNG, WebP up to 10 MB: brochures, floor plans, invitations.
  event: "cv",
  // JPEG, PNG, WebP, GIF up to 5 MB.
  completion: "image",
};

/** When the owning agent may add or remove each kind. Admin may at any status. */
export const AGENT_ATTACHMENT_STATUSES: Record<ExhibitionAttachmentKind, string[]> = {
  event: ["draft", "submitted", "revision_requested"],
  completion: ["active", "completed"],
};

export function isAttachmentKind(value: unknown): value is ExhibitionAttachmentKind {
  return value === "event" || value === "completion";
}

/**
 * Who may add or remove a file of `kind` on this request. Super agents review
 * and never edit the agent's files; agents only on their own request and only
 * at the stage the kind belongs to.
 */
export function canManageAttachments(
  role: string,
  userId: string,
  item: { agentId: { toString(): string }; status: string },
  kind: ExhibitionAttachmentKind,
): boolean {
  if (role === "admin") return item.status !== "archived";
  if (role !== "agent") return false;
  if (item.agentId.toString() !== userId) return false;
  return AGENT_ATTACHMENT_STATUSES[kind].includes(item.status);
}

export interface SignedAttachment {
  _id: string;
  kind: ExhibitionAttachmentKind;
  fileName: string;
  contentType: string;
  size: number;
  uploadedAt?: Date | string;
  url: string;
}

const ATTACHMENT_URL_TTL_SECONDS = 60 * 60;

/** The attachments a browser may see: signed URLs, never the storage key. */
export async function signAttachments(attachments: IExhibitionAttachment[] | undefined): Promise<SignedAttachment[]> {
  return Promise.all(
    (attachments ?? []).map(async (a) => ({
      _id: String(a._id),
      kind: a.kind,
      fileName: a.fileName,
      contentType: a.contentType,
      size: a.size,
      uploadedAt: a.uploadedAt,
      url: await getPresignedUrl(a.key, ATTACHMENT_URL_TTL_SECONDS, { inline: true, contentType: a.contentType }).catch(() => ""),
    })),
  );
}

/**
 * A request as JSON, with its attachments signed. Takes a lean object or a
 * hydrated document (spreading a document would copy Mongoose internals).
 */
export async function withSignedAttachments<T extends { attachments?: IExhibitionAttachment[] }>(
  item: T | (T & { toObject(): T }),
): Promise<Omit<T, "attachments"> & { attachments: SignedAttachment[] }> {
  const plain: T = typeof (item as { toObject?: unknown }).toObject === "function" ? (item as { toObject(): T }).toObject() : item;
  return { ...plain, attachments: await signAttachments(plain.attachments) };
}
