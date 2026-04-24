"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Gift, Copy, Users, Share2, CheckCircle2, Link2,
  TrendingUp, Inbox,
} from "lucide-react";
import { SocialShareButtons } from "@/components/shared/SocialShareButtons";

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
      toast.error("Failed to load referral data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReferralData(); }, [fetchReferralData]);

  const copyCode = async () => {
    if (!data?.referralLink) return;
    try {
      await navigator.clipboard.writeText(data.referralLink);
      toast.success("Referral link copied!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Gift className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Referral Program</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Invite friends to join and earn rewards when they get hired
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total Referrals", value: data?.totalReferrals ?? 0, icon: <Users className="h-5 w-5" /> },
            { label: "Successful", value: data?.successfulReferrals ?? 0, icon: <CheckCircle2 className="h-5 w-5" /> },
            { label: "Pending", value: data?.pendingReferrals ?? 0, icon: <TrendingUp className="h-5 w-5" /> },
            { label: "Rewards Earned", value: `${data?.rewardsEarned ?? 0}`, icon: <Gift className="h-5 w-5" /> },
          ].map((m) => (
            <div key={m.label} className="workspace-glass-panel rounded-2xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{m.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{m.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Referral Link */}
      <section className="workspace-panel-surface rounded-[28px] p-5 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Your Referral Link</h2>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              readOnly
              value={data?.referralLink ?? ""}
              className="pl-9 font-mono text-sm"
            />
          </div>
          <Button onClick={copyCode}>
            <Copy className="mr-1 h-4 w-4" /> Copy
          </Button>
        </div>

        {data?.referralCode && (
          <p className="text-xs text-muted-foreground">
            Referral code: <span className="font-mono font-semibold text-foreground">{data.referralCode}</span>
          </p>
        )}

        {data?.referralLink && (
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Share on social media</p>
            <SocialShareButtons
              url={data.referralLink}
              title="Join me on MPLOYEDIN — the smart job platform!"
              description="Sign up using my referral link and find your dream job faster"
            />
          </div>
        )}
      </section>

      {/* Referral History */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        <h2 className="text-lg font-semibold text-foreground">Referral History</h2>

        {(!data?.referrals || data.referrals.length === 0) ? (
          <div className="mt-6 flex flex-col items-center justify-center py-10 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">No referrals yet</p>
            <p className="mt-1 text-xs text-muted-foreground/70">Share your link to start referring friends</p>
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
                  <p className="mt-1 text-[10px] text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
