"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Headset, Home, RefreshCw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RecoveryActionsProps {
  reset: () => void;
}

export function RecoveryActions({ reset }: RecoveryActionsProps) {
  const { locale = "en" } = useParams<{ locale?: string }>();
  const pathname = usePathname();
  const t = useTranslations("errorBoundary");
  const isEmployer = pathname.includes("/employer");
  const isJobSeeker = pathname.includes("/job-seeker");
  const homeHref = isEmployer
    ? `/${locale}/employer`
    : isJobSeeker
      ? `/${locale}/job-seeker`
      : `/${locale}`;
  const supportHref = isEmployer
    ? `/${locale}/employer/messages`
    : isJobSeeker
      ? `/${locale}/job-seeker/messages`
      : `/${locale}/contact`;

  return (
    <div className="grid w-full grid-cols-2 gap-2 pt-2">
      <Button onClick={reset} className="col-span-2 min-h-11">
        <RefreshCw className="h-4 w-4" />
        {t("tryAgain")}
      </Button>
      <Button asChild variant="outline" className="min-h-11">
        <Link href={homeHref}>
          <Home className="h-4 w-4" />
          {t("home")}
        </Link>
      </Button>
      <Button asChild variant="outline" className="min-h-11">
        <Link href={supportHref}>
          <Headset className="h-4 w-4" />
          {t("support")}
        </Link>
      </Button>
      <Button asChild variant="ghost" className="col-span-2 min-h-11">
        <a href="/api/health" target="_blank" rel="noreferrer">
          <Server className="h-4 w-4" />
          {t("platformStatus")}
        </a>
      </Button>
    </div>
  );
}
