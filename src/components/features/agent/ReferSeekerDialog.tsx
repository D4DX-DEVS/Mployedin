"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, Copy, Crown, ExternalLink, Loader2, MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { referralUrlFor } from "@/lib/referrals/url";
import { getOrCreateSeekerReferralLink, type SeekerReferralLink } from "@/lib/referrals/seekerLink";

interface ReferSeekerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
  workspace?: "agent" | "super-agent";
}

type SeekerLink = SeekerReferralLink;

/**
 * "Refer a job seeker" on the agent's or super-agent's Job Seekers page (client point #5,
 * 2026-10-12): the caller's newest live job-seeker link — created on first use
 * — with copy and WhatsApp. Whoever signs up through it joins as Premium and
 * is credited to the caller (`attachJobSeekerReferral`). The full set of links
 * stays on Marketing → Referral Links or the caller's workspace.
 */
export function ReferSeekerDialog({ open, onOpenChange, locale, workspace = "agent" }: ReferSeekerDialogProps) {
  const t = useTranslations("agentJobSeekers.refer");
  const tc = useTranslations("common");
  const [link, setLink] = useState<SeekerLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const found = await getOrCreateSeekerReferralLink(t("defaultLabel"));
      setLink(found);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Every opening re-reads the link, so the sign-up count is current; the
  // last link stays on screen meanwhile.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const url = link ? referralUrlFor({ code: link.code, audience: "job_seeker" }, locale, window.location.origin) : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (permissions, insecure origin): the field stays selectable.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* pe-10: on the phone sheet the close button sits level with the
            description, and drew over its first line. */}
        <DialogHeader className="pe-10">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="flex items-start gap-2">
            <Crown className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <span>{t("description")}</span>
          </DialogDescription>
        </DialogHeader>

        {loading && !link ? (
          <div className="flex min-h-24 items-center justify-center" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">{tc("loading")}</span>
          </div>
        ) : error && !link ? (
          <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="text-destructive">{t("loadError")}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 font-semibold text-foreground hover:bg-secondary"
            >
              {tc("tryAgain")}
            </button>
          </div>
        ) : link ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="refer-seeker-link">{t("linkLabel")}</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="refer-seeker-link"
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 font-mono text-xs"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                  {copied ? t("copied") : t("copy")}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{t("joined", { count: link.usedCount ?? 0 })}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(t("whatsappText", { url }))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-secondary"
              >
                <MessageCircle className="h-4 w-4 text-green-600" aria-hidden="true" />
                {t("whatsapp")}
              </a>
              <Link
                href={`/${locale}/${workspace}/referral-links`}
                className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg px-2 text-sm font-semibold text-primary hover:underline"
              >
                {t("manage")}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
