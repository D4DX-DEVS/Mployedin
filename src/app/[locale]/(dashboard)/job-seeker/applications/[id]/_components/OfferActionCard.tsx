"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Calendar, Check, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { applicationNumberLocale, formatApplicationDate } from "@/lib/jobSeeker/applicationFormat";
import { csrfFetch } from "@/lib/security/csrf-client";
import type { OfferItem } from "./types";

// ── Offer Action Card ──────────────────────────────────────────────
export function OfferActionCard({ offer, onUpdated }: { offer: OfferItem; onUpdated: () => void }) {
  const t = useTranslations("applicationDetail");
  const locale = useLocale();
  const [responding, setResponding] = useState(false);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const isPending = offer.status === "pending";
  const isExpired = offer.expiresAt && new Date(offer.expiresAt) < new Date();

  // Static keys: next-intl throws on an unknown key.
  const offerStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return t("offerStatus.pending");
      case "accepted": return t("offerStatus.accepted");
      case "declined": return t("offerStatus.declined");
      case "expired": return t("offerStatus.expired");
      case "withdrawn": return t("offerStatus.withdrawn");
      case "countered": return t("offerStatus.countered");
      default: return status;
    }
  };

  async function handleRespond(status: "accepted" | "declined") {
    setResponding(true);
    try {
      const res = await csrfFetch(`/api/offers/${offer._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          ...(status === "declined" && declineReason && { declineReason }),
        }),
      });
      if (res.ok) {
        onUpdated();
        setShowDeclineForm(false);
      }
    } finally {
      setResponding(false);
    }
  }

  return (
    <div className="card-base rounded-xl border border-emerald-200/70 bg-emerald-50/30 space-y-2.5 panel-body">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-emerald-800">{t("offer")}</span>
        <Badge variant="outline" className={cn(
          "text-xs",
          offer.status === "pending" && "bg-amber-50 text-amber-700 border-amber-200",
          offer.status === "accepted" && "bg-emerald-50 text-emerald-700 border-emerald-200",
          offer.status === "declined" && "bg-red-50 text-red-700 border-red-200",
          offer.status === "expired" && "bg-gray-50 text-gray-600 border-gray-200",
        )}>
          {offerStatusLabel(offer.status)}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {offer.salary && (
          <span className="font-medium text-foreground">
            {new Intl.NumberFormat(applicationNumberLocale(locale), { style: "currency", currency: offer.salary.currency, maximumFractionDigits: 0 }).format(offer.salary.amount)}{" "}
            {offer.salary.period === "annually" ? t("perYear") : offer.salary.period === "monthly" ? t("perMonth") : offer.salary.period ? `/ ${offer.salary.period}` : null}
          </span>
        )}
        {offer.startDate && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" /> {t("startDate")}: {formatApplicationDate(offer.startDate, locale, { withYear: true })}
          </span>
        )}
        {offer.expiresAt && isPending && (
          <span className={cn("text-[11px]", isExpired ? "text-red-600" : "text-amber-600")}>
            {isExpired ? t("expired") : `${t("expires")}: ${formatApplicationDate(offer.expiresAt, locale, { withYear: true })}`}
          </span>
        )}
      </div>

      {offer.benefits && (
        <p className="text-xs text-muted-foreground">{offer.benefits}</p>
      )}

      {/* Offer Actions */}
      {isPending && !isExpired && !showDeclineForm && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="dense"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => handleRespond("accepted")}
            disabled={responding}
          >
            {responding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {t("acceptOffer")}
          </Button>
          <Button
            size="dense"
            variant="outline"
            className="gap-1.5 text-red-600 hover:text-red-700 border-red-200"
            onClick={() => setShowDeclineForm(true)}
            disabled={responding}
          >
            <XCircle className="h-3.5 w-3.5" /> {t("decline")}
          </Button>
        </div>
      )}

      {showDeclineForm && (
        <div className="space-y-2 pt-1 border-t">
          <Textarea
            placeholder={t("declineReasonPlaceholder")}
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            maxLength={500}
            rows={2}
            className="resize-none text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="dense"
              variant="destructive"
              className=""
              onClick={() => handleRespond("declined")}
              disabled={responding}
            >
              {responding && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              {t("confirmDecline")}
            </Button>
            <Button size="dense" variant="ghost" className="" onClick={() => setShowDeclineForm(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
