"use client";

import { useLayoutEffect } from "react";

interface HtmlLocaleSyncProps {
  locale: string;
}

/**
 * Keeps `<html lang dir>` in step with the page's language.
 *
 * The root layout writes both, but Next does not render the root layout again
 * on an in-page navigation, so switching language by a link left the document
 * English and left-to-right until a reload. The locale layout's own wrapper
 * covers the page, but not what is drawn outside it: dialogs, menus and the
 * Cookie settings are portalled to <body> and take their direction, and a
 * screen reader its language, from <html>.
 *
 * A layout effect, so the attributes are right before the new page is painted.
 * Mounted once, in the locale layout. Renders nothing.
 */
export default function HtmlLocaleSync({ locale }: HtmlLocaleSyncProps): null {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const dir = locale === "ar" ? "rtl" : "ltr";
    if (root.lang !== locale) root.lang = locale;
    if (root.dir !== dir) root.dir = dir;
  }, [locale]);

  return null;
}
