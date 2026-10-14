"use client";

import { useRef, useState } from "react";
import { FileText, ImagePlus, Loader2, Paperclip, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/ui/fileSize";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  removeExhibitionFile,
  uploadExhibitionFiles,
  type AttachmentKind,
  type ExhibitionAttachmentView,
} from "./attachmentsClient";

const isImage = (contentType: string) => contentType.startsWith("image/");

/** Images as a thumbnail grid, documents as rows. Each opens in a new tab. */
export function AttachmentList({
  attachments,
  onRemove,
  removingId,
}: {
  attachments: ExhibitionAttachmentView[];
  onRemove?: (attachment: ExhibitionAttachmentView) => void;
  removingId?: string | null;
}) {
  const t = useTranslations("exhibitions");
  const images = attachments.filter((a) => isImage(a.contentType));
  const docs = attachments.filter((a) => !isImage(a.contentType));

  const removeButton = (a: ExhibitionAttachmentView, className: string) =>
    onRemove ? (
      <button
        type="button"
        onClick={() => onRemove(a)}
        disabled={removingId === a._id}
        aria-label={t("removeFile", { name: a.fileName })}
        className={className}
      >
        {removingId === a._id ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <X className="size-3.5" aria-hidden="true" />}
      </button>
    ) : null;

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((a) => (
            <li key={a._id} className="relative">
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("openFile", { name: a.fileName })}
                className="block aspect-square overflow-hidden rounded-lg border border-border/60 bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                { }
                <img src={a.url} alt={a.fileName} loading="lazy" className="h-full w-full object-cover" />
              </a>
              {removeButton(a, "absolute end-1 top-1 flex size-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow ring-1 ring-border hover:bg-background")}
            </li>
          ))}
        </ul>
      )}
      {docs.length > 0 && (
        <ul className="space-y-1.5">
          {docs.map((a) => (
            <li key={a._id} className="flex min-w-0 items-center gap-2 rounded-lg border border-border/60 px-3 py-2">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-primary hover:underline" title={a.fileName}>
                {a.fileName}
              </a>
              <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(a.size)}</span>
              {removeButton(a, "tap-target-box flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground")}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Client-side checks that match the server's, so a bad file is caught before upload. */
export function useFileChecks(kind: AttachmentKind) {
  const t = useTranslations("exhibitions");
  const accepted = ATTACHMENT_ACCEPT[kind].split(",");
  return (incoming: File[], alreadyCount: number): { files: File[]; error: string } => {
    let error = "";
    const files: File[] = [];
    for (const file of incoming) {
      if (!accepted.includes(file.type)) { error = t("fileTypeNotAllowed", { name: file.name }); continue; }
      if (file.size > ATTACHMENT_MAX_BYTES[kind]) { error = t("fileTooLarge", { name: file.name, size: formatFileSize(ATTACHMENT_MAX_BYTES[kind]) }); continue; }
      files.push(file);
    }
    const room = Math.max(0, ATTACHMENT_MAX_COUNT[kind] - alreadyCount);
    if (files.length > room) {
      error = t("tooManyFiles", { count: ATTACHMENT_MAX_COUNT[kind] });
      files.splice(room);
    }
    return { files, error };
  };
}

/**
 * Files chosen in a form, uploaded by the caller after the request saves
 * (a new request has no id to upload against yet).
 */
export function PendingFilesField({
  kind,
  files,
  onChange,
  existingCount = 0,
  label,
  hint,
}: {
  kind: AttachmentKind;
  files: File[];
  onChange: (files: File[]) => void;
  existingCount?: number;
  label: string;
  hint: string;
}) {
  const t = useTranslations("exhibitions");
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const check = useFileChecks(kind);
  const inputId = `pending-files-${kind}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-foreground">{label} <span className="text-xs text-muted-foreground">({t("optional")})</span></label>
        <Button type="button" variant="outline" size="sm" className="min-h-11 gap-1.5 sm:min-h-9" onClick={() => inputRef.current?.click()}>
          {kind === "completion" ? <ImagePlus className="size-4" aria-hidden="true" /> : <Paperclip className="size-4" aria-hidden="true" />}
          {kind === "completion" ? t("addPhotos") : t("addFiles")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT[kind]}
        className="sr-only"
        onChange={(event) => {
          const result = check(Array.from(event.target.files ?? []), existingCount + files.length);
          setError(result.error);
          onChange([...files, ...result.files]);
          event.target.value = "";
        }}
      />
      {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex min-w-0 items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2">
              <Upload className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm" title={file.name}>{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                aria-label={t("removeFile", { name: file.name })}
                className="tap-target-box flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A request's files of one kind in a detail view: the list, and — when the
 * viewer may manage them — add (uploads at once) and remove.
 */
export function AttachmentsSection({
  requestId,
  kind,
  attachments,
  canManage,
  onChange,
}: {
  requestId: string;
  kind: AttachmentKind;
  attachments: ExhibitionAttachmentView[];
  canManage: boolean;
  onChange: (all: ExhibitionAttachmentView[]) => void;
}) {
  const t = useTranslations("exhibitions");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const check = useFileChecks(kind);
  const mine = attachments.filter((a) => a.kind === kind);

  const add = async (picked: File[]) => {
    const { files, error: checkError } = check(picked, mine.length);
    setError(checkError);
    if (files.length === 0) return;
    setUploading(true);
    const result = await uploadExhibitionFiles(requestId, kind, files);
    setUploading(false);
    if (!result.ok) { setError(result.error ?? t("uploadError")); return; }
    toast.success(t("filesUploaded"));
    onChange(result.attachments);
  };

  const remove = async (attachment: ExhibitionAttachmentView) => {
    setRemovingId(attachment._id);
    const result = await removeExhibitionFile(requestId, attachment._id);
    setRemovingId(null);
    if (!result.ok) { toast.error(result.error ?? t("removeFileError")); return; }
    toast.success(t("fileRemoved"));
    onChange(result.attachments);
  };

  if (mine.length === 0 && !canManage) return <p className="text-sm text-muted-foreground">{t("noAttachments")}</p>;

  return (
    <div className="space-y-2">
      {mine.length > 0 ? (
        <AttachmentList attachments={mine} onRemove={canManage ? (a) => void remove(a) : undefined} removingId={removingId} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("noAttachments")}</p>
      )}
      {canManage && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT[kind]}
            className="sr-only"
            aria-label={kind === "completion" ? t("addPhotos") : t("addFiles")}
            onChange={(event) => { void add(Array.from(event.target.files ?? [])); event.target.value = ""; }}
          />
          <Button type="button" variant="outline" size="sm" className="min-h-11 gap-1.5 sm:min-h-9" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : kind === "completion" ? <ImagePlus className="size-4" aria-hidden="true" /> : <Paperclip className="size-4" aria-hidden="true" />}
            {uploading ? t("uploadingFiles") : kind === "completion" ? t("addPhotos") : t("addFiles")}
          </Button>
        </>
      )}
      {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
