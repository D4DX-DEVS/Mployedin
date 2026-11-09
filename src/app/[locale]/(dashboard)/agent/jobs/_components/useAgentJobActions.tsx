"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/useConfirm";

/** The 409 PATCH /api/jobs/[id] answers when the employer's profile still blocks publishing. */
const PUBLISH_GATE_ERROR = "EMPLOYER_PROFILE_INCOMPLETE";

type Pending = { jobId: string; action: "publish" | "delete" } | null;

/**
 * Publish / discard a draft from the agent's jobs list and job page — the same
 * moves the employer's own jobs page offers, through the same endpoints.
 */
export function useAgentJobActions(onChanged?: () => void) {
  const t = useTranslations("agentJobs");
  const tJobs = useTranslations("employerJobs");
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [pending, setPending] = useState<Pending>(null);

  // The caller reloads what it shows (the list re-fetches; the job page
  // invalidates its query) — this hook holds no data of its own.
  const refresh = () => onChanged?.();

  async function publish(jobId: string): Promise<boolean> {
    if (!(await confirm(tJobs("confirmPublish")))) return false;
    setPending({ jobId, action: "publish" });
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast.error(data.error === PUBLISH_GATE_ERROR ? t("draftActions.publishGated") : tJobs("toastFailedPublish"));
        return false;
      }
      toast.success(tJobs("toastJobPublished"));
      refresh();
      return true;
    } catch {
      toast.error(tJobs("toastFailedPublish"));
      return false;
    } finally {
      setPending(null);
    }
  }

  async function discard(jobId: string): Promise<boolean> {
    if (!(await confirm({ message: tJobs("confirmDeleteDraft"), variant: "destructive" }))) return false;
    setPending({ jobId, action: "delete" });
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(tJobs("toastFailedDelete"));
        return false;
      }
      toast.success(t("draftActions.draftDeleted"));
      refresh();
      return true;
    } catch {
      toast.error(tJobs("toastFailedDelete"));
      return false;
    } finally {
      setPending(null);
    }
  }

  const isPending = (jobId: string, action: "publish" | "delete") =>
    pending?.jobId === jobId && pending.action === action;

  // Render `dialog` once in the page, or the confirmation promise never resolves.
  const dialog = <>{ConfirmDialogNode}</>;

  return { publish, discard, isPending, dialog };
}
