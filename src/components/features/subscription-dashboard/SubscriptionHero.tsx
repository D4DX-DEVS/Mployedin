"use client";

import Link from "next/link";
import { Crown, Download, Settings, Plus, RefreshCw } from "lucide-react";
import { PageHero } from "@/components/shared/PageHero";

interface SubscriptionHeroProps {
  onRefresh?: () => void;
}

export function SubscriptionHero({ onRefresh }: SubscriptionHeroProps) {
  return (
    <PageHero
      title="Subscription Dashboard"
      eyebrow="Finance · Subscriptions"
      icon={Crown}
      description="A complete view of revenue, plans, and activity across employers and job seekers."
      actions={
        <>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          )}
          <button className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-accent">
            <Download className="h-4 w-4" />
            Export Report
          </button>
          <Link
            href="/admin/subscription-plans"
            className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <Settings className="h-4 w-4" />
            Manage Plans
          </Link>
          <Link
            href="/admin/subscriptions"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Subscription
          </Link>
        </>
      }
    />
  );
}
