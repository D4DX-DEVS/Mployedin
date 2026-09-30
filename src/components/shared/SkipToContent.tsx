/** Every route group's <main> carries this id; the skip link jumps to it. */
export const MAIN_CONTENT_ID = "main-content";

interface SkipToContentProps {
  label: string;
}

/**
 * The first focusable element on every page — the [locale] root layout renders
 * it ahead of any header or navigation. It waits above the viewport and slides
 * into the top corner when it takes keyboard focus. It is never display:none,
 * so screen readers list it too.
 */
export function SkipToContent({ label }: SkipToContentProps) {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="fixed start-3 top-3 z-[200] -translate-y-[200%] rounded-lg bg-background px-4 py-3 text-sm font-semibold text-foreground shadow-lg focus:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:transition-transform"
    >
      {label}
    </a>
  );
}
