"use client";

import { useTranslations } from "next-intl";

/**
 * "Skip to main content" (WCAG 2.4.1 Bypass Blocks). First focusable element
 * on every page; visible only when focused. Targets #main-content, falling
 * back to the page's <main> landmark so no layout has to opt in.
 */
export function SkipLink() {
  const t = useTranslations("accessibility");

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById("main-content") ?? document.querySelector<HTMLElement>("main");
    if (!target) return;
    e.preventDefault();
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: false });
    target.scrollIntoView({ block: "start" });
  };

  return (
    <a href="#main-content" onClick={onClick} className="skip-link">
      {t("skipToContent")}
    </a>
  );
}
