"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InviteError, useInviteMatchedCandidate, type MatchingCandidate } from "@/hooks/useJobMatchingCandidates";

const MAX_MESSAGE = 1000;

interface InviteCandidateDialogProps {
  jobId: string;
  jobTitle: string;
  /** The candidate being invited; null closes the dialog. */
  candidate: MatchingCandidate | null;
  onClose: () => void;
}

/**
 * Confirm an invite to apply. The candidate gets an in-app notification and an
 * email linking to the job; applying stays their decision.
 */
export function InviteCandidateDialog({ jobId, jobTitle, candidate, onClose }: InviteCandidateDialogProps) {
  const t = useTranslations("agentJobMatches");
  const messageId = useId();
  const [message, setMessage] = useState("");
  const invite = useInviteMatchedCandidate(jobId);

  useEffect(() => {
    if (candidate) setMessage("");
  }, [candidate]);

  const send = () => {
    if (!candidate) return;
    invite.mutate(
      { jobSeekerId: candidate.jobSeekerId, message },
      {
        onSuccess: () => {
          toast.success(t("inviteSent", { name: candidate.name }));
          onClose();
        },
        onError: (err) => {
          const status = err instanceof InviteError ? err.status : 0;
          const description =
            status === 409 ? t("inviteConflict")
              : status === 400 ? t("inviteUnavailable")
                : status === 403 ? t("inviteForbidden")
                  : t("inviteRetry");
          toast.error(t("inviteError"), { description });
        },
      },
    );
  };

  return (
    <Dialog open={candidate !== null} onOpenChange={(open) => { if (!open && !invite.isPending) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("inviteTitle", { name: candidate?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("inviteDescription", { job: jobTitle })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor={messageId} className="text-sm font-medium text-foreground">{t("messageLabel")}</label>
          <Textarea
            id={messageId}
            value={message}
            maxLength={MAX_MESSAGE}
            rows={4}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("messagePlaceholder")}
            className="resize-none rounded-xl"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={invite.isPending} className="min-h-11 rounded-xl sm:min-h-9">
            {t("cancel")}
          </Button>
          <Button type="button" onClick={send} disabled={invite.isPending} className="min-h-11 gap-2 rounded-xl sm:min-h-9">
            {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            {invite.isPending ? t("sending") : t("sendInvite")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
