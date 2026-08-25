"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type NoticeVariant = "candidateList" | "candidateDetail" | "aiScore";

interface CandidateDataNoticeProps {
  /** Which point in the journey this notice sits at. */
  variant: NoticeVariant;
  className?: string;
}

/**
 * Contextual privacy information shown where an employer first sees candidate
 * personal data, rather than only behind a footer link.
 *
 * ICO guidance is that privacy information should be easy to find, written in
 * plain language, and given at the point it is relevant. The full notice still
 * lives at /privacy — this is the signpost, not a replacement for it.
 *
 * ponytail: always visible, no dismiss state. A one-line notice the user can
 * permanently hide is a notice most users never see, and there is nothing to
 * persist or sync.
 */
export function CandidateDataNotice({ variant, className }: CandidateDataNoticeProps) {
  const t = useTranslations("employerCompliance.privacy");
  const locale = useLocale();
  const isAi = variant === "aiScore";
  const Icon = isAi ? Sparkles : Info;

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
    </aside>
  );
}
