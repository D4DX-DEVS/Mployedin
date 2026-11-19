"use client";

import { useEffect, useState } from "react";

/**
 * Whether a candidate's original CV file is there, as far as the CV route says:
 *  - available: it answered 200
 *  - missing:   404 with code NO_CV (no file on the profile / sent with the application)
 *  - notFound:  404 or 403 without it (the candidate or the application is gone, or not the viewer's)
 *  - error:     anything else (a storage hiccup, a dropped connection): says nothing about the file
 *  - unknown:   not asked yet
 */
export type OriginalCvAvailability = "unknown" | "available" | "missing" | "notFound" | "error";

export interface OriginalCv {
  /** An in-memory blob: URL the document can be framed from (see the note below), once it has arrived. */
  blobUrl: string | null;
  /** The document cannot be framed: no viewer in this browser, a download that failed, or not a PDF. */
  previewFailed: boolean;
  availability: OriginalCvAvailability;
  /**
   * The file the route served is the Mployedin-built PDF that went with the
   * application (it says so in X-Mployedin-Cv-Built), not one the candidate
   * uploaded. False until it has answered, and for anything but a 200.
   */
  sentWithApplication: boolean;
}

/** The route's marker (see /api/employers/candidates/[id]/cv): the served original is a CV built on Mployedin and sent with the application. */
const BUILT_HEADER = "X-Mployedin-Cv-Built";

function sentWithApplicationOf(res: Response): boolean {
  return res.ok && res.headers?.get?.(BUILT_HEADER) === "1";
}

async function availabilityOf(res: Response): Promise<OriginalCvAvailability> {
  if (res.ok) return "available";
  if (res.status !== 404 && res.status !== 403) return "error";
  const code = await res.json().then((body: { code?: unknown } | null) => body?.code, () => undefined);
  return code === "NO_CV" ? "missing" : "notFound";
}

const blank = (url: string): OriginalCv & { url: string } => ({ url, blobUrl: null, previewFailed: false, availability: "unknown", sentWithApplication: false });

/**
 * The CV is streamed through our own origin, but its response carries
 * X-Frame-Options: DENY / CSP frame-ancestors 'none' (clickjacking
 * protection), so the browser refuses to frame it by URL. Instead we fetch
 * the bytes and render an in-memory blob: URL, which is exempt from those
 * directives. A missing URL, a browser without a built-in PDF viewer, or a
 * failed fetch falls back to a download prompt.
 *
 * Whether the file exists is learned from that same request, and where there
 * is no viewer (most phones) the request is still made, only to read its
 * status: a 200 is dropped without taking the body, so the answer does not
 * depend on the preview. (A HEAD would not do: the route has only GET, so Next
 * answers HEAD by running GET, and a HEAD has no body to tell NO_CV from
 * not-found.)
 *
 * What is returned belongs to the `url` it was fetched for; `enabled` false
 * (an image, shown by <img>) fetches nothing.
 */
export function useOriginalCv(url: string, enabled: boolean): OriginalCv {
  const [slot, setSlot] = useState(() => blank(url));

  useEffect(() => {
    if (!enabled) return;
    const patch = (change: Partial<OriginalCv>) => setSlot((s) => (s.url === url ? { ...s, ...change } : s));
    setSlot((s) => (s.url === url ? s : blank(url)));

    const canViewPdf =
      typeof navigator === "undefined" ||
      (navigator as { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false;
    if (!url) {
      patch({ previewFailed: true });
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    const request = () => fetch(url, { credentials: "same-origin", signal: controller.signal });

    if (!canViewPdf) {
      patch({ previewFailed: true });
      request()
        .then(async (res) => {
          const availability = await availabilityOf(res);
          // Only its existence matters here: do not keep the file's bytes.
          if (res.ok) void Promise.resolve(res.body?.cancel()).catch(() => {});
          if (!cancelled) patch({ availability, sentWithApplication: sentWithApplicationOf(res) });
        })
        .catch(() => { if (!cancelled) patch({ availability: "error" }); });
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    // Fail only if the bytes haven't arrived yet — once the blob exists the
    // iframe renders from memory and can't meaningfully hang, so a slow
    // download must not flip an already-working preview to the fallback.
    const timer = setTimeout(() => {
      if (!cancelled && !objectUrl) patch({ previewFailed: true });
    }, 20000);

    request()
      .then(async (res) => {
        const availability = await availabilityOf(res);
        if (!cancelled) patch({ availability, sentWithApplication: sentWithApplicationOf(res) });
        if (!res.ok) throw new Error(`CV preview failed: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        // Non-PDF documents (doc/docx/…) can't be framed by the browser.
        if (blob.type && !blob.type.includes("pdf")) throw new Error("not embeddable");
        objectUrl = URL.createObjectURL(blob);
        clearTimeout(timer);
        patch({ blobUrl: objectUrl, previewFailed: false });
      })
      .catch(() => {
        if (!cancelled) patch({ previewFailed: true });
      });

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, enabled]);

  return slot.url === url ? slot : blank(url);
}
