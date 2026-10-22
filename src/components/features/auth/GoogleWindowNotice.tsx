import { cn } from "@/lib/utils";

/** The id the Google buttons point `aria-describedby` at. */
export const GOOGLE_WINDOW_NOTICE_ID = "google-window-notice";

interface GoogleWindowNoticeProps {
  /** Shown normally: "Continue with Google opens a Google window". */
  notice: string;
  /** Shown instead while the browser has blocked that window. */
  blockedMessage: string;
  blocked: boolean;
  className?: string;
}

/**
 * The line under a "Continue with Google" button. It stays on screen (a toast
 * would vanish before the visitor reads it) and, if the browser blocked the
 * Google window, says what to do.
 *
 * The announcement comes from a separate, visually hidden live region that is
 * always in the page and empty until the window is blocked: a screen reader only
 * announces text that is added to a live region it already knows about, and an
 * `aria-live` attribute added to a paragraph together with its new text is often
 * missed. The visible line is `aria-hidden` while it carries the blocked message,
 * so it is not read twice (the button's `aria-describedby` still reaches it).
 * Nothing is announced when the neutral notice comes back on the next click.
 */
export function GoogleWindowNotice({ notice, blockedMessage, blocked, className }: GoogleWindowNoticeProps) {
  return (
    <>
      <p
        id={GOOGLE_WINDOW_NOTICE_ID}
        aria-hidden={blocked ? true : undefined}
        className={cn("text-center text-xs", blocked ? "font-medium text-destructive" : "text-muted-foreground", className)}
      >
        {blocked ? blockedMessage : notice}
      </p>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {blocked ? blockedMessage : ""}
      </span>
    </>
  );
}
