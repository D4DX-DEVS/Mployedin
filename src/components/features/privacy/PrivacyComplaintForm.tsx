"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ComplaintLimitError, useSendPrivacyComplaint } from "@/hooks/useDataPrivacy";
import { COMPLAINT_MAX, COMPLAINT_MIN } from "@/lib/gdpr/complaintRules";

/**
 * [LEGAL] DUAA 2025 complaints duty: anyone can tell us they are unhappy with
 * how their personal data is used. The complaint lands in Admin → GDPR, is
 * acknowledged within 30 days, and its answer shows in the request history
 * below. The ICO line under the history stays: they can still go there.
 */
export function PrivacyComplaintForm() {
  const t = useTranslations("dataPrivacy");
  const [message, setMessage] = useState("");
  const send = useSendPrivacyComplaint();
  const tooShort = message.trim().length < COMPLAINT_MIN;

  const submit = () => {
    send.mutate(message, {
      onSuccess: () => {
        setMessage("");
        toast.success(t("complaintSent"));
      },
      onError: (err) => toast.error(err instanceof ComplaintLimitError ? t("complaintLimit") : t("complaintError")),
    });
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="privacy-complaint">{t("complaintLabel")}</Label>
      <Textarea
        id="privacy-complaint"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={COMPLAINT_MAX}
        rows={4}
        placeholder={t("complaintPlaceholder")}
        className="resize-y text-sm"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("complaintHint")}</p>
        <Button onClick={submit} disabled={tooShort || send.isPending} className="min-h-11 gap-2 sm:min-h-9">
          {send.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
          {t("complaintButton")}
        </Button>
      </div>
    </div>
  );
}
