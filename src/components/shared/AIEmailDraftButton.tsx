"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Copy, Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";

const EMAIL_CONTEXT_KEYS = [
  { value: "after_application", labelKey: "afterApplication" },
  { value: "after_shortlist", labelKey: "afterShortlist" },
  { value: "after_interview", labelKey: "afterInterview" },
  { value: "after_rejection", labelKey: "afterRejection" },
  { value: "after_offer", labelKey: "afterOffer" },
  { value: "follow_up_general", labelKey: "followUpGeneral" },
] as const;

interface EmailDraft {
  subject: string;
  body: string;
  tone: string;
  suggestedSendTime: string;
  candidateName: string;
  jobTitle: string;
  context: string;
}

interface AIEmailDraftButtonProps {
  applicationId: string;
  candidateName?: string;
  defaultContext?: string;
}

export function AIEmailDraftButton({ applicationId, candidateName, defaultContext }: AIEmailDraftButtonProps) {
  const t = useTranslations("emailDraft");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState(defaultContext ?? "follow_up_general");
  const [customInstructions, setCustomInstructions] = useState("");
  const [draft, setDraft] = useState<EmailDraft | null>(null);

  async function generate() {
    setLoading(true);
    setDraft(null);
    try {
      const res = await fetch("/api/ai/email-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          context,
          customInstructions: customInstructions.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: t("failed") }));
        throw new Error(err.error ?? t("draftFailed"));
      }
      const data: EmailDraft = await res.json();
      setDraft(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedToGenerate"));
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard() {
    if (!draft) return;
    const text = `Subject: ${draft.subject}\n\n${draft.body.replace(/<br\s*\/?>/gi, "\n")}`;
    navigator.clipboard.writeText(text);
    toast.success(t("copiedToClipboard"));
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 rounded-lg px-2.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-500/10"
        onClick={() => setOpen(true)}
        title="AI Email Draft"
      >
        <Mail className="me-1 h-3 w-3" />
        {t("aiEmail")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto rounded-[24px] border-border bg-background p-0">
          <DialogHeader className="border-b border-border px-6 py-5">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-violet-500" />
              <DialogTitle className="text-lg font-semibold">{t("title")}</DialogTitle>
            </div>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              {candidateName ? t("descriptionFor", { name: candidateName }) : t("description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            {!draft ? (
              <>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">{t("emailContext")}</label>
                  <select
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-background/70 px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
                  >
                    {EMAIL_CONTEXT_KEYS.map((c) => (
                      <option key={c.value} value={c.value}>{t(c.labelKey)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">{t("customInstructions")}</label>
                  <textarea
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder={t("customInstructionsPlaceholder")}
                    rows={3}
                    maxLength={300}
                    className="mt-1 w-full rounded-xl border border-border bg-background/70 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 resize-none"
                  />
                </div>
                <Button
                  onClick={generate}
                  disabled={loading}
                  className="w-full h-11 rounded-xl bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700"
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {loading ? tc("generating") : t("generateDraft")}
                </Button>
              </>
            ) : (
              <>
                <div className="workspace-glass-panel rounded-2xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("subject")}</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{draft.subject}</p>
                </div>

                <div className="workspace-glass-panel rounded-2xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("emailBody")}</p>
                  <div
                    className="mt-2 text-sm leading-6 text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: draft.body }}
                  />
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 font-medium capitalize">
                    {t("tone")}: {draft.tone}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 font-medium">
                    {t("send")}: {draft.suggestedSendTime?.replace(/_/g, " ")}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={copyToClipboard}
                    variant="outline"
                    className="flex-1 h-10 rounded-xl border-border text-sm"
                  >
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    {tc("copy")}
                  </Button>
                  <Button
                    onClick={() => setDraft(null)}
                    variant="outline"
                    className="flex-1 h-10 rounded-xl border-border text-sm"
                  >
                    {tc("regenerate")}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
