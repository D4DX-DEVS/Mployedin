"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/hooks/useConfirm";
import { formatCount, formatListDate } from "@/lib/ui/intlFormat";

interface TermsSummary {
  /** A date (or an ISO timestamp once a new version was started): shown as a date, never "v1.0". */
  version: string;
  isBaseline: boolean;
  acceptedUsers: number;
  totalUsers: number;
  /** Non-admin users who still have to accept: the server's count, never worked out here. */
  pendingUsers: number;
}

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; summary: TermsSummary };

/** Null for anything that is not the summary, so a wrong answer shows as an error, not as made-up counts. */
function parseTermsSummary(raw: unknown): TermsSummary | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { version, isBaseline, acceptedUsers, totalUsers, pendingUsers } = raw as Record<string, unknown>;
  if (
    typeof version !== "string" ||
    typeof isBaseline !== "boolean" ||
    typeof acceptedUsers !== "number" ||
    typeof totalUsers !== "number" ||
    typeof pendingUsers !== "number"
  ) {
    return null;
  }
  return { version, isBaseline, acceptedUsers, totalUsers, pendingUsers };
}

/** Shaped like the card: title, three lines, the links, and the button. */
function TermsCardSkeleton() {
  return (
    <section
      className="workspace-panel-surface flex flex-col gap-3 rounded-2xl panel-body sm:flex-row sm:items-start sm:justify-between"
      data-testid="terms-card-skeleton"
      aria-busy="true"
    >
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-full max-w-lg" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-11 w-full shrink-0 sm:w-52" />
    </section>
  );
}

/**
 * The Terms of Service + Privacy Policy version in force: when it started, how
 * many users accepted it and how many still have to, links to both documents,
 * and starting a new version. Kept apart from cookie consent.
 *
 * Starting a new version asks every non-admin, including people who already
 * accepted, to accept again before they continue. Nobody is notified. The
 * button and its confirm say exactly that.
 */
export function TermsVersionCard() {
  const t = useTranslations("adminGdpr");
  const locale = useLocale();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/admin/gdpr/terms");
      const summary = res.ok ? parseTermsSummary(await res.json()) : null;
      setState(summary ? { status: "ready", summary } : { status: "error" });
    } catch {
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startNewVersion = async () => {
    const confirmed = await confirm({
      title: t("termsNewVersionConfirmTitle"),
      message: t("termsNewVersionConfirmMessage"),
      confirmLabel: t("termsNewVersionConfirmButton"),
      variant: "destructive",
    });
    if (!confirmed) return;
    setStarting(true);
    try {
      const res = await fetch("/api/admin/gdpr/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const summary = res.ok ? parseTermsSummary(await res.json()) : null;
      if (summary) {
        setState({ status: "ready", summary });
        toast.success(t("termsNewVersionSuccess"));
      } else if (res.ok) {
        // Started, but the answer is unreadable: load the counts again rather than guess them.
        toast.success(t("termsNewVersionSuccess"));
        void load();
      } else {
        toast.error(t("termsNewVersionError"));
      }
    } catch {
      toast.error(t("termsNewVersionError"));
    } finally {
      setStarting(false);
    }
  };

  if (state.status === "loading") return <TermsCardSkeleton />;
  if (state.status === "error") {
    return (
      <section className="workspace-panel-surface rounded-2xl panel-body">
        <ErrorState className="py-6 sm:py-6" title={t("termsLoadErrorTitle")} retryLabel={t("cookieChoiceRetry")} onRetry={() => void load()} />
      </section>
    );
  }
  const { summary } = state;

  const docLink = (href: string, label: string) => (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline sm:min-h-0"
    >
      {label}
      <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">{t("termsOpensNewTab")}</span>
    </Link>
  );

  return (
    <>
      {ConfirmDialogNode}
      <section className="workspace-panel-surface flex flex-col gap-3 rounded-2xl panel-body sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">{t("termsVersionTitle")}</p>
          <p className="text-sm text-muted-foreground">
            {t("termsVersionSummary", {
              date: formatListDate(new Date(summary.version), locale),
              accepted: formatCount(summary.acceptedUsers, undefined, locale),
              total: formatCount(summary.totalUsers, undefined, locale),
            })}
          </p>
          <p className="text-sm font-medium text-foreground">
            {t("termsStillToAccept", { count: formatCount(summary.pendingUsers, undefined, locale) })}
          </p>
          <p className="text-xs text-muted-foreground">{t("termsVersionHelp")}</p>
          <div className="flex flex-wrap gap-x-4">
            {docLink(`/${locale}/terms`, t("termsViewTerms"))}
            {docLink(`/${locale}/privacy`, t("termsViewPrivacy"))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5 sm:max-w-64 sm:items-end">
          <Button variant="outline" className="min-h-11" onClick={startNewVersion} disabled={starting} aria-busy={starting}>
            {t("termsNewVersionButton")}
          </Button>
          <p className="text-xs text-muted-foreground sm:text-end">{t("termsNewVersionHelp")}</p>
        </div>
      </section>
    </>
  );
}
