"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Crown, Download, Settings, Plus, RefreshCw } from "lucide-react";
import { PageHero } from "@/components/shared/PageHero";

interface SubscriptionHeroProps {
  onRefresh?: () => void;
}

export function SubscriptionHero({ onRefresh }: SubscriptionHeroProps) {
  const t = useTranslations("subscriptionHero");
  const { locale } = useParams<{ locale: string }>();

  return (
    <PageHero
      title={t("pageTitle")}
      eyebrow={t("eyebrow")}
      icon={Crown}
      description={t("pageDescription")}
      actions={
        <>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              <RefreshCw className="h-4 w-4" />
              {t("refresh")}
            </button>
          )}
          <button className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-accent">
            <Download className="h-4 w-4" />
            {t("exportReport")}
          </button>
          <Link
            href={`/${locale}/admin/subscription-plans`}
            className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <Settings className="h-4 w-4" />
            {t("managePlans")}
          </Link>
          <Link
            href={`/${locale}/admin/subscriptions`}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t("newSubscription")}
          </Link>
        </>
      }
    />
  );
}
