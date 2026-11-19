"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Eye, FileText, Info, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BuiltCvResponse } from "@/lib/cv/renderBuiltCv";
import { STAFF_CV_TEMPLATE } from "@/lib/jobSeeker/cvDesign";

/**
 * "Preview as employers see it" on the CV builder: the standardised CV that
 * staff are shown, opened read-only so a seeker knows what they will see.
 *
 * It draws the same thing, the same way: the built-CV details come from the
 * endpoint staff read (so the field selection and the "is there anything to
 * build from" rule cannot drift) and are drawn by MployedinCvView in
 * STAFF_CV_TEMPLATE: that template, default formatting, without the sections
 * the seeker hid, and with headings in the CV's own language.
 *
 * It shows the profile as it is SAVED, not the form on screen: that is what
 * employers see now, and the builder's unsaved edits may never be saved. It
 * asks again each time it is opened, so a save shows up. The seeker's chosen
 * design and layout options apply to the file they download, not here.
 */

// The PDF renderer comes with the viewer: loaded only when the dialog opens.
const MployedinCvView = dynamic(() => import("@/components/shared/MployedinCvView"), { ssr: false });

/** The parts of the seeker's profile that say whether a CV file was uploaded. */
export interface UploadedCvSource {
  cv?: { originalUrl?: string | null } | null;
  documents?: ReadonlyArray<{
    category?: string;
    url?: string;
    /** Set on the stored copy of the CV built on Mployedin. */
    builtHash?: string;
  }> | null;
}

/**
 * Whether the seeker has a CV file they uploaded, which staff can open beside
 * the standardised one. The stored copy of the CV built on Mployedin is not an
 * upload (it is the same CV), so it does not count.
 */
export function hasUploadedCvFile(profile: UploadedCvSource | null | undefined): boolean {
  if (!profile) return false;
  const documents = profile.documents ?? [];
  const builtUrls = new Set(documents.filter((d) => d.builtHash && d.url).map((d) => d.url));
  const profileCv = profile.cv?.originalUrl;
  if (profileCv && !builtUrls.has(profileCv)) return true;
  return documents.some((d) => d.category === "resume" && !!d.url && !d.builtHash);
}

export interface EmployerViewPreviewProps {
  /** The seeker's own profile id; null before they have a profile (nothing to preview). */
  seekerId: string | null;
  /** The seeker has a CV file they uploaded (see hasUploadedCvFile). */
  hasUploadedFile: boolean;
  /** The builder holds edits that are not in the saved profile. */
  hasUnsavedChanges?: boolean;
  className?: string;
}

type Load =
  | { state: "loading" }
  | { state: "ready"; data: BuiltCvResponse }
  | { state: "failed" };

export function EmployerViewPreview({ seekerId, hasUploadedFile, hasUnsavedChanges = false, className }: EmployerViewPreviewProps) {
  const t = useTranslations("cvBuilderPage.employerView");
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  // Bumped by "Try again" to ask once more.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !seekerId) return;
    let live = true;
    setLoad({ state: "loading" });
    fetch(`/api/employers/candidates/${seekerId}/cv?kind=built`, { credentials: "same-origin", cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<BuiltCvResponse>) : Promise.reject(new Error(String(res.status)))))
      .then((data) => { if (live) setLoad({ state: "ready", data }); })
      .catch(() => { if (live) setLoad({ state: "failed" }); });
    return () => { live = false; };
  }, [open, seekerId, attempt]);

  // Each opening starts from loading, so the last opening's CV never flashes before the new one.
  function changeOpen(next: boolean) {
    if (next) setLoad({ state: "loading" });
    setOpen(next);
  }

  // No profile yet is the same as a profile with nothing in it.
  const empty = !seekerId || (load.state === "ready" && !load.data.hasContent);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => changeOpen(true)} className={className}>
        <Eye className="size-4" aria-hidden="true" />
        {t("open")}
      </Button>

      <Dialog open={open} onOpenChange={changeOpen}>
        {/* Full screen on a phone; a tall panel from sm up. */}
        <DialogContent className="flex h-dvh max-h-dvh flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[90dvh] sm:max-h-[90dvh] sm:max-w-4xl sm:gap-0 sm:p-0">
          <DialogHeader className="space-y-1.5 border-b px-4 py-3 pe-16 text-start sm:px-6 sm:py-4">
            <DialogTitle className="text-base">{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
            {hasUploadedFile && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Paperclip className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {t("uploadedFile")}
              </p>
            )}
            {hasUnsavedChanges && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {t("unsaved")}
              </p>
            )}
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto bg-muted/50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
            {empty ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-6 text-center">
                <FileText className="size-10 text-muted-foreground/60" aria-hidden="true" />
                <p className="text-sm font-medium">{t("empty")}</p>
              </div>
            ) : load.state === "failed" ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm font-medium">{t("loadFailed")}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
                  {t("retry")}
                </Button>
              </div>
            ) : load.state === "loading" ? (
              <div className="mx-auto max-w-3xl" role="status" aria-label={t("loading")}>
                <Skeleton className="aspect-[1/1.414] w-full rounded-md" />
              </div>
            ) : (
              <MployedinCvView
                url={`/api/employers/candidates/${seekerId}/cv?kind=built`}
                data={load.data}
                templateOverride={STAFF_CV_TEMPLATE}
                showToolbar={false}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
