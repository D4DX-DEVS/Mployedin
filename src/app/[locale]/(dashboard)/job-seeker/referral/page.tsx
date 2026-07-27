"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Gift, Copy, Users, CheckCircle2, Link2,
  TrendingUp, Inbox,
} from "lucide-react";
import { SocialShareButtons } from "@/components/shared/SocialShareButtons";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ReferralData {
  referralCode: string;
  referralLink: string;
  totalReferrals: number;
  successfulReferrals: number;
  pendingReferrals: number;
  rewardsEarned: number;
  referrals: Array<{
    _id: string;
    name: string;
    email: string;
    status: "pending" | "registered" | "active";
    createdAt: string;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function JobSeekerReferralPage() {
  const t = useTranslations("jobSeekerExtra.referral");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReferralData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/referral");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchReferralData(); }, [fetchReferralData]);

  const copyCode = async () => {
    if (!data?.referralLink) return;
    try {
      await navigator.clipboard.writeText(data.referralLink);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <DashboardPageHeader icon={Gift} eyebrow={t("title")} title={t("title")} description={t("description")} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        icon={Gift}
        eyebrow={t("title")}
        title={t("title")}
        description={t("description")}
        metrics={[
          { label: t("total"), value: (data?.totalReferrals ?? 0).toLocaleString(numberLocale), icon: Users },
          { label: t("successful"), value: (data?.successfulReferrals ?? 0).toLocaleString(numberLocale), icon: CheckCircle2 },
          { label: t("pending"), value: (data?.pendingReferrals ?? 0).toLocaleString(numberLocale), icon: TrendingUp },
          { label: t("rewards"), value: (data?.rewardsEarned ?? 0).toLocaleString(numberLocale), icon: Gift },
        ]}
      />

      <section className="workspace-panel-surface rounded-[28px] p-5 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{t("linkTitle")}</h2>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Link2 className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              readOnly
              value={data?.referralLink ?? ""}
              className="ps-9 font-mono text-sm"
            />
          </div>
          <Button onClick={copyCode}>
            <Copy className="me-1 h-4 w-4" /> {t("copy")}
          </Button>
        </div>

        {data?.referralCode && (
          <p className="text-xs text-muted-foreground">
            {t("code")} <span className="font-mono font-semibold text-foreground">{data.referralCode}</span>
          </p>
        )}

        {data?.referralLink && (
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">{t("share")}</p>
            <SocialShareButtons
              url={data.referralLink}
              title={t("shareTitle")}
              description={t("shareDescription")}
            />
          </div>
        )}
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-5">
        <h2 className="text-lg font-semibold text-foreground">{t("history")}</h2>

        {(!data?.referrals || data.referrals.length === 0) ? (
          <div className="mt-6 flex flex-col items-center justify-center py-10 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">{t("empty")}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">{t("emptyDescription")}</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {data.referrals.map((r) => (
              <div key={r._id} className="workspace-glass-panel rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.email}</p>
                </div>
                <div className="text-right">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    r.status === "active" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30" :
                    r.status === "registered" ? "bg-sky-50 text-sky-600 dark:bg-sky-950/30" :
                    "bg-amber-50 text-amber-600 dark:bg-amber-950/30"
                  }`}>
                    {r.status}
                  </span>
                  <p className="mt-1 text-[10px] text-muted-foreground">{new Date(r.createdAt).toLocaleDateString(numberLocale)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
