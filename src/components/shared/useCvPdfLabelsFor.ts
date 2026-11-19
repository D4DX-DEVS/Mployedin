"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useCvPdfLabels } from "@/app/[locale]/(dashboard)/job-seeker/cv/use-cv-pdf-labels";
import type { CVPDFLabels } from "@/app/[locale]/(dashboard)/job-seeker/cv/pdf/shared";
import { labelLangOfLocale, loadCvPdfLabels, resolveCvPdfLabels, type CvLabelLang } from "@/lib/cv/cvPdfLabels";

/**
 * The labels a standardised CV is drawn and downloaded with: in the CV's own
 * language (`lang`), whatever language the screen is in.
 *
 * `labels` is for drawing: the screen's labels until the CV's language has
 * loaded (at once when it is the screen's own, so the common case never waits
 * or loads anything), then the CV's. `resolve()` is for saving a file: it
 * waits for the CV's language, so a download pressed early is still in it. A
 * language that cannot be loaded leaves the screen's labels in place.
 *
 * `ready` is false only while the CV's language is on its way, so a preview can
 * keep its loading state instead of flashing headings in the wrong language. A
 * language that fails to load is ready at once, with the screen's labels.
 *
 * The seeker's own builder does not use this: it prints in the seeker's screen language.
 */
export function useCvPdfLabelsFor(lang: CvLabelLang | null): { labels: CVPDFLabels; ready: boolean; resolve: () => Promise<CVPDFLabels> } {
  const uiLabels = useCvPdfLabels();
  const uiLocale = useLocale();
  const needed = lang !== null && lang !== labelLangOfLocale(uiLocale) ? lang : null;
  const [loaded, setLoaded] = useState<{ lang: CvLabelLang; labels: CVPDFLabels | null } | null>(null);

  useEffect(() => {
    if (!needed) return;
    let live = true;
    loadCvPdfLabels(needed)
      .then((labels) => { if (live) setLoaded({ lang: needed, labels }); })
      .catch(() => { if (live) setLoaded({ lang: needed, labels: null }); });
    return () => { live = false; };
  }, [needed]);

  const resolve = useCallback(
    () => (lang ? resolveCvPdfLabels(lang, uiLocale, uiLabels, loadCvPdfLabels) : Promise.resolve(uiLabels)),
    [lang, uiLocale, uiLabels],
  );

  const settled = needed !== null && loaded?.lang === needed ? loaded : null;
  return { labels: settled?.labels ?? uiLabels, ready: needed === null || settled !== null, resolve };
}
