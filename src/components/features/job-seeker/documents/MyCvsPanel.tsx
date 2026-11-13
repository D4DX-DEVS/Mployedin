"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, Copy, Eye, FileText, Loader2, Pencil, PenLine, Send, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { csrfFetch } from "@/lib/security/csrf-client";
import { BUILT_CV_KEY, PROFILE_CV_KEY, defaultCvKey, uploadedResumes } from "@/lib/applications/cvChoice";
import { cn } from "@/lib/utils";

export interface MyCvDocument {
  id: string;
  name: string;
  category: string;
  url: string;
  size: number;
  uploadedAt: string;
  builtHash?: string;
  /** Whether job matching has read it (resumes only). */
  cvStatus?: string;
}

interface MyCvsPanelProps {
  locale: string;
  documents: MyCvDocument[];
  hasProfileCv: boolean;
  hasBuiltCv: boolean;
  preferredCvId: string | null;
  /** The reading status line under an uploaded CV. */
  renderStatus: (doc: MyCvDocument) => ReactNode;
  onRemove: (doc: MyCvDocument) => void;
  /** After a rename or a new choice: refresh the cached list. */
  onChanged: () => void;
  /** Opens the page's file picker for a new CV. No button when absent. */
  onUploadCv?: () => void;
}

type Row = {
  key: string;
  name: string;
  detail: string;
  doc?: MyCvDocument;
  /** The earlier upload this one repeats (same name and size). */
  copyOf?: string;
};

/**
 * Every CV the seeker can send, with the one that goes with their applications
 * marked — by the same rule the apply screens use (lib/applications/cvChoice.ts).
 * They can pick another, rename an upload so they know which job it is for,
 * and drop a file they uploaded twice.
 */
export function MyCvsPanel({
  locale,
  documents,
  hasProfileCv,
  hasBuiltCv,
  preferredCvId,
  renderStatus,
  onRemove,
  onChanged,
  onUploadCv,
}: MyCvsPanelProps) {
  const t = useTranslations("jobSeekerExtra.documents.myCvs");
  const tApply = useTranslations("easyApply");
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const sentKey = defaultCvKey({ documents, hasProfileCv, hasBuiltCv, preferredId: preferredCvId });

  const seen = new Map<string, string>();
  const uploadRows: Row[] = uploadedResumes(documents).map((doc) => {
    const signature = `${doc.name.trim().toLowerCase()}|${doc.size}`;
    const copyOf = seen.get(signature);
    if (!copyOf) seen.set(signature, doc.name);
    const date = doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString(numberLocale) : "";
    return {
      key: doc.id,
      name: doc.name,
      detail: t("uploadedDetail", { date, size: Math.max(1, Math.round(doc.size / 1024)).toLocaleString(numberLocale) }),
      doc,
      copyOf,
    };
  });

  const rows: Row[] = [
    ...(hasBuiltCv ? [{ key: BUILT_CV_KEY, name: tApply("builtCv"), detail: t("builtDetail") }] : []),
    ...(hasProfileCv ? [{ key: PROFILE_CV_KEY, name: tApply("profileCvLabel"), detail: t("profileDetail") }] : []),
    // Newest upload first.
    ...uploadRows.reverse(),
  ];

  const choose = async (key: string) => {
    setBusy(key);
    try {
      const res = await csrfFetch("/api/job-seeker/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredCvId: key }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(t("chosen"));
      onChanged();
    } catch {
      toast.error(t("chooseFailed"));
    } finally {
      setBusy(null);
    }
  };

  const saveName = async (doc: MyCvDocument) => {
    const name = draftName.trim();
    if (!name || name === doc.name) {
      setRenaming(null);
      return;
    }
    setBusy(doc.id);
    try {
      const res = await csrfFetch("/api/job-seeker/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: doc.id, name }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(t("renamed"));
      setRenaming(null);
      onChanged();
    } catch {
      toast.error(t("renameFailed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="my-cvs-title" className="card-base max-sm:!p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0 flex-1 max-sm:basis-full">
          <h2 id="my-cvs-title" className="font-semibold">{t("title")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
        {onUploadCv && (
          <Button type="button" variant="outline" size="sm" className="min-h-10 rounded-xl" onClick={onUploadCv}>
            <Upload className="me-1.5 size-4" aria-hidden />
            {t("uploadCv")}
          </Button>
        )}
        <Button asChild size="sm" className="min-h-10 rounded-xl">
          <Link href={`/${locale}/job-seeker/cv`}>
            <PenLine className="me-1.5 size-4" aria-hidden />
            {hasBuiltCv ? t("editBuilt") : t("build")}
          </Link>
        </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => {
            const isSent = row.key === sentKey;
            const isRenaming = row.doc && renaming === row.doc.id;
            return (
              <li
                key={row.key}
                className={cn("flex flex-wrap items-center gap-3 p-4", row.copyOf && "bg-amber-50", isSent && "bg-primary/[0.04]")}
                data-cv-row={row.key}
              >
                <span
                  className={cn(
                    "grid h-11 w-9 shrink-0 place-items-center rounded-lg",
                    row.copyOf ? "bg-amber-100 text-amber-800" : "bg-primary/10 text-primary",
                  )}
                >
                  {row.copyOf ? <Copy className="size-4" aria-hidden /> : <FileText className="size-4" aria-hidden />}
                </span>

                <div className="min-w-0 flex-1 basis-48">
                  {isRenaming && row.doc ? (
                    <form
                      className="flex flex-wrap items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveName(row.doc!);
                      }}
                    >
                      <label htmlFor={`cv-name-${row.doc.id}`} className="sr-only">{t("renameLabel")}</label>
                      <Input
                        id={`cv-name-${row.doc.id}`}
                        value={draftName}
                        maxLength={120}
                        autoFocus
                        onChange={(event) => setDraftName(event.target.value)}
                        className="h-10 min-w-0 flex-1"
                      />
                      <Button type="submit" size="sm" className="min-h-10" disabled={busy === row.doc.id}>
                        {busy === row.doc.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : t("save")}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="min-h-10" onClick={() => setRenaming(null)}>
                        {t("cancel")}
                      </Button>
                    </form>
                  ) : (
                    <>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-sm font-semibold">{row.name}</span>
                        {isSent && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            <Check className="size-3" aria-hidden />
                            {t("sentBadge")}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.copyOf ? t("copyOf", { name: row.copyOf }) : row.detail}
                      </p>
                      {row.doc && !row.copyOf ? renderStatus(row.doc) : null}
                    </>
                  )}
                </div>

                {!isRenaming && (
                  <div className="flex flex-wrap items-center gap-1 max-sm:w-full max-sm:justify-end">
                    {row.copyOf && row.doc ? (
                      <Button size="sm" variant="outline" className="min-h-10 rounded-xl" onClick={() => onRemove(row.doc!)}>
                        <Trash2 className="me-1.5 size-4" aria-hidden />
                        {t("removeCopy")}
                      </Button>
                    ) : (
                      <>
                        {!isSent && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-10 rounded-xl"
                            disabled={busy === row.key}
                            onClick={() => void choose(row.key)}
                          >
                            {busy === row.key ? (
                              <Loader2 className="me-1.5 size-4 animate-spin" aria-hidden />
                            ) : (
                              <Send className="me-1.5 size-4" aria-hidden />
                            )}
                            {t("sendThis")}
                          </Button>
                        )}
                        {row.doc && (
                          <>
                            <a
                              href={`/api/job-seeker/documents/${row.doc.id}/download`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="grid size-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              aria-label={t("viewNamed", { name: row.name })}
                            >
                              <Eye className="size-4" aria-hidden />
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                setDraftName(row.doc!.name);
                                setRenaming(row.doc!.id);
                              }}
                              className="grid size-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              aria-label={t("renameNamed", { name: row.name })}
                            >
                              <Pencil className="size-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemove(row.doc!)}
                              className="grid size-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                              aria-label={t("removeNamed", { name: row.name })}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
