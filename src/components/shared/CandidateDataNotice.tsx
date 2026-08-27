"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Info, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type NoticeVariant = "candidateList" | "candidateDetail" | "aiScore";

interface CandidateDataNoticeProps {
  /** Which point in the journey this notice sits at. */
  variant: NoticeVariant;
  className?: string;
  /** Render as a small info icon button that opens the notice in a popover,
   *  instead of the always-visible banner. */
  compact?: boolean;
}

/**
 * Contextual privacy information shown where an employer first sees candidate
 * personal data, rather than only behind a footer link.
 *
 * ICO guidance is that privacy information should be easy to find, written in
 * plain language, and given at the point it is relevant. The full notice still
 * lives at /privacy — this is the signpost, not a replacement for it.
 *
 * ponytail: no dismiss state — nothing to persist or sync. Default is the
 * always-visible banner; `compact` renders an info icon button whose popover
 * holds the same text for pages where the banner costs too much space.
 */
export function CandidateDataNotice({ variant, className, compact = false }: CandidateDataNoticeProps) {
  const t = useTranslations("employerCompliance.privacy");
  const locale = useLocale();
  const isAi = variant === "aiScore";
  const Icon = isAi ? Sparkles : Info;

  const body = (
    <p className="min-w-0">
      {t(variant)}{" "}
      {!isAi && (
        <Link
          href={`/${locale}/privacy`}
          className="font-medium text-foreground underline underline-offset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("linkLabel")}
        </Link>
      )}
    </p>
  );

  if (compact) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("title")}
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-primary transition-colors",
              "hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              className
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="text-[0.8125rem] leading-5 text-muted-foreground sm:w-80">
          {body}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <aside
      aria-label={t("title")}
      className={cn(
        "flex items-start gap-2 rounded-xl border border-border/70 bg-secondary/50 px-3 py-2.5",
        // 0.8125rem floor: readable on a phone without zooming, per ICO
        // guidance that privacy information must not require pinch-zoom.
        "text-[0.8125rem] leading-5 text-muted-foreground",
        className
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      {body}
    </aside>
  );
}
