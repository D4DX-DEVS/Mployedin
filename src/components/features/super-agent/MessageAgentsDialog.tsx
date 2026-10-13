"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/security/csrf-client";
import { cn } from "@/lib/utils";

export interface MessageableAgent {
  userId: string;
  name: string;
  email: string;
}

interface MessageAgentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opened from one agent: start in "Choose agents" with them ticked. */
  presetAgentUserId?: string;
  /** Called after a send, e.g. to refresh the conversation list. */
  onSent?: () => void;
}

const MAX_LENGTH = 2000;

/**
 * "Message agents": one message to every agent in the super agent's team, or
 * to the agents they tick. Each agent receives it in their own chat with the
 * super agent and replies privately there.
 */
export function MessageAgentsDialog({ open, onOpenChange, presetAgentUserId, onSent }: MessageAgentsDialogProps) {
  const t = useTranslations("superAgentTeamMessage");
  const tc = useTranslations("common");
  const [agents, setAgents] = useState<MessageableAgent[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [mode, setMode] = useState<"all" | "selected">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [reload, setReload] = useState(0);

  // Opened from one agent: start with just them ticked. Runs on open only, so
  // it never undoes a choice made while the list loads.
  useEffect(() => {
    if (!open || !presetAgentUserId) return;
    setMode("selected");
    setSelected(new Set([presetAgentUserId]));
  }, [open, presetAgentUserId]);

  // The team on every open (or Retry), so a newly added agent is counted.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadFailed(false);
    fetch("/api/super-agent/messages")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { agents?: MessageableAgent[] }) => { if (!cancelled) setAgents(data.agents ?? []); })
      .catch(() => { if (!cancelled) setLoadFailed(true); });
    return () => { cancelled = true; };
  }, [open, reload]);

  const reset = () => {
    setMode("all");
    setSelected(new Set());
    setQuery("");
    setContent("");
  };

  const close = (next: boolean) => {
    if (!next && !sending) reset();
    onOpenChange(next);
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (agents ?? []).filter((a) => !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
  }, [agents, query]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const recipientCount = mode === "all" ? agents?.length ?? 0 : selected.size;
  const canSend = content.trim().length > 0 && recipientCount > 0 && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const res = await csrfFetch("/api/super-agent/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), recipients: mode === "all" ? "all" : [...selected] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(res.status === 429 ? t("sendTooMany") : t("sendError"));
        return;
      }
      toast.success(t("sendSuccess", { count: data?.sent ?? recipientCount }));
      if (data?.failed) toast.error(t("sendPartial", { count: data.failed }));
      reset();
      onOpenChange(false);
      onSent?.();
    } catch {
      toast.error(t("sendError"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg" mobileSheet>
        {/* Phone sheet: keep the text clear of the 44px close button. */}
        <DialogHeader className="max-sm:px-12">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("sendTo")}</legend>
            <div role="radiogroup" aria-label={t("sendTo")} className="grid grid-cols-2 gap-2">
              {(["all", "selected"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => setMode(value)}
                  className={cn(
                    "min-h-11 rounded-lg border px-3 py-2 text-start text-sm transition-colors sm:min-h-10",
                    mode === value ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border hover:border-primary/40",
                  )}
                >
                  {value === "all" ? t("allAgents", { count: agents?.length ?? 0 }) : t("chooseAgents")}
                </button>
              ))}
            </div>
          </fieldset>

          {loadFailed && (
            <p role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <span>{t("loadError")}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setReload((n) => n + 1)}>{t("retry")}</Button>
            </p>
          )}

          {mode === "selected" && !(loadFailed && !agents) && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchAgents")} aria-label={t("searchAgents")} className="h-10 ps-8" />
              </div>
              {/* `relative`: Radix Checkbox's hidden inputs otherwise escape the
                  scroll box and stretch the dialog. */}
              <div className="relative max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1">
                {!agents ? (
                  <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{tc("loading")}</p>
                ) : visible.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">{t("noAgents")}</p>
                ) : visible.map((agent) => (
                  <label key={agent.userId} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60">
                    <Checkbox checked={selected.has(agent.userId)} onCheckedChange={() => toggle(agent.userId)} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{agent.name || agent.email}</span>
                      {agent.name && <span className="block truncate text-xs text-muted-foreground">{agent.email}</span>}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("selectedCount", { count: selected.size })}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="team-message">{t("messageLabel")}</Label>
            <Textarea
              id="team-message"
              value={content}
              maxLength={MAX_LENGTH}
              rows={5}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("messagePlaceholder")}
            />
            <p className="flex justify-between gap-2 text-xs text-muted-foreground">
              <span>{t("replyNote")}</span>
              <span className="tabular-nums">{content.length}/{MAX_LENGTH}</span>
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={sending}>{tc("cancel")}</Button>
          <Button onClick={() => void send()} disabled={!canSend} className="gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            {t("sendButton", { count: recipientCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
