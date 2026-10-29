"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bot, Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatApplicationDate } from "@/lib/jobSeeker/applicationFormat";
import { csrfFetch } from "@/lib/security/csrf-client";
import type { AutomatedDecisionItem } from "./types";

/**
 * Tells the candidate their application was rejected by the employer's
 * automatic screening, why in plain terms, and lets them ask a person to look
 * again (lib/hiring/automatedDecision.ts). Once asked, it says where that stands.
 */
export function AutomatedDecisionCard({
  applicationId,
  status,
  decision,
  onUpdated,
}: {
  applicationId: string;
  status: string;
  decision: AutomatedDecisionItem;
  onUpdated: () => void;
}) {
  const t = useTranslations("applicationDetail.automatedDecision");
  const locale = useLocale();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const canRequest = status === "rejected" && !decision.reviewRequestedAt;

  async function requestReview() {
    setSending(true);
    try {
      const res = await csrfFetch(`/api/applications/${applicationId}/human-review`, {
        method: "POST",
        body: JSON.stringify(note.trim() ? { note: note.trim() } : {}),
      });
      if (res.ok) {
        toast.success(t("requestSent"));
        onUpdated();
      } else {
        toast.error(t("requestFailed"));
      }
    } catch {
      toast.error(t("requestFailed"));
    } finally {
      setSending(false);
    }
  }

  const date = (iso?: string) => (iso ? formatApplicationDate(iso, locale, { withYear: true }) : "");

  return (
    <section className="card-base space-y-3 rounded-2xl border panel-body" aria-labelledby="automated-decision-heading">
      <div className="flex items-start gap-3">
        {decision.reviewedAt ? (
          <UserCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        ) : (
          <Bot className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <div className="min-w-0 space-y-1">
          <h2 id="automated-decision-heading" className="text-sm font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("explanation", { score: decision.score, threshold: decision.threshold, date: date(decision.decidedAt) })}
          </p>
          {decision.reviewedAt ? (
            <p className="text-sm">{t("reviewed", { date: date(decision.reviewedAt) })}</p>
          ) : decision.reviewRequestedAt ? (
            <p className="text-sm">{t("reviewPending", { date: date(decision.reviewRequestedAt) })}</p>
          ) : null}
        </div>
      </div>

      {canRequest && (
        <div className="space-y-2 border-t pt-3">
          <p className="text-sm">{t("rightToReview")}</p>
          <Label htmlFor="human-review-note" className="text-sm">{t("noteLabel")}</Label>
          <Textarea
            id="human-review-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder={t("notePlaceholder")}
            className="resize-none text-sm"
          />
          <Button size="sm" className="gap-1.5" onClick={requestReview} disabled={sending}>
            {sending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <UserCheck className="size-4" aria-hidden="true" />}
            {t("requestButton")}
          </Button>
        </div>
      )}
    </section>
  );
}
