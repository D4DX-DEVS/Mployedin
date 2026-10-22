"use client";

import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { Slot } from "@radix-ui/react-slot";
import { OPEN_SETTINGS_EVENT } from "@/lib/consent/client";

/**
 * Open the Cookie settings dialog from anywhere. CookieConsent (mounted by
 * every route group's layout through CookieConsentMount) listens for the event
 * and opens the dialog, whether or not a choice was already made.
 */
export function openCookieSettings(): void {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

interface CookieSettingsLinkProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Render the child element (e.g. a <Button>) instead of a plain <button>. */
  asChild?: boolean;
}

/**
 * The "Cookie settings" control: the public footer, the Data & Privacy page and
 * the dashboard account menu (which calls openCookieSettings directly). The
 * caller supplies the translated label and the styling.
 */
export const CookieSettingsLink = forwardRef<HTMLButtonElement, CookieSettingsLinkProps>(
  ({ asChild = false, onClick, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented) openCookieSettings();
    };
    return <Comp ref={ref} type={asChild ? type : (type ?? "button")} onClick={handleClick} {...props} />;
  },
);
CookieSettingsLink.displayName = "CookieSettingsLink";
