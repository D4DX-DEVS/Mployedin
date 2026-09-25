"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SECTION_PANEL } from "./dashboard-section";

interface SectionErrorProps {
  id: string;
  title: string;
  message: string;
  retryLabel: string;
}

/**
 * A section whose queries failed says so in its own place; the rest of the
 * dashboard still renders. Retry re-runs the server render.
 */
export function SectionError({ id, title, message, retryLabel }: SectionErrorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <section aria-labelledby={id} className={SECTION_PANEL} data-surface="light-panel" data-section-error>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-800">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={id} className="heading-section font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          <p className="text-xs leading-4 text-muted-foreground" role="alert">
            {message}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-9 gap-1.5"
          disabled={pending}
          onClick={() => startTransition(() => router.refresh())}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
          {retryLabel}
        </Button>
      </div>
    </section>
  );
}
