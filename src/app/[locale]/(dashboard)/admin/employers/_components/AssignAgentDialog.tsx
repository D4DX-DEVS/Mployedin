"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState } from "@/components/shared/ErrorState";
import type { AssignableAgent, EmployerAgentSummary } from "@/lib/agents/employerAssignment";

/** "none" is the picker's value for "no agent"; everything else is an Agent doc id. */
const NO_AGENT = "none";

interface AssignAgentDialogProps {
  /** The employer being assigned, by USER id (the admin list's row id). */
  employer: { userId: string; companyName: string } | null;
  onClose: () => void;
  /** Called after a successful save with the employer's new agent (null = none). */
  onAssigned: (userId: string, agent: EmployerAgentSummary | null) => void;
}

/**
 * Admin: add, change or remove the agent who looks after an employer.
 * Employers can join from anywhere, so this is how an account gets to the
 * right agent — and through them, to that agent's super-agent, targets and
 * invoicing.
 */
export function AssignAgentDialog({ employer, onClose, onAssigned }: AssignAgentDialogProps) {
  const t = useTranslations("adminEmployers.assignAgent");
  const [agents, setAgents] = useState<AssignableAgent[]>([]);
  const [current, setCurrent] = useState<EmployerAgentSummary | null>(null);
  const [selected, setSelected] = useState<string>(NO_AGENT);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  const userId = employer?.userId ?? null;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await fetch(`/api/employers/${userId}/agent`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { current: EmployerAgentSummary | null; agents: AssignableAgent[] };
      setAgents(data.agents ?? []);
      setCurrent(data.current ?? null);
      setSelected(data.current?.id ?? NO_AGENT);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) void load();
  }, [userId, load]);

  const unchanged = selected === (current?.id ?? NO_AGENT);

  const handleSave = async () => {
    if (!employer || unchanged) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/employers/${employer.userId}/agent`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selected === NO_AGENT ? null : selected }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        current?: EmployerAgentSummary | null;
        movedOpenJobs?: number;
        error?: string;
      };
      if (!res.ok) {
        toast.error(t("saveFailed"));
        return;
      }
      const next = data.current ?? null;
      toast.success(
        next
          ? t("savedAssigned", { company: employer.companyName, agent: next.name, count: data.movedOpenJobs ?? 0 })
          : t("savedRemoved", { company: employer.companyName }),
      );
      onAssigned(employer.userId, next);
      onClose();
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const options = [
    { value: NO_AGENT, label: t("noAgentOption") },
    ...agents.map((a) => ({
      value: a.id,
      label: a.superAgentName ? t("agentOption", { name: a.name, superAgent: a.superAgentName }) : a.name,
      triggerLabel: a.name,
    })),
  ];

  return (
    <Dialog open={!!employer} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      {/* overflow-visible: the agent list is portalled into this dialog (so the
          modal focus trap lets it be clicked) and the base overflow-y-auto cut
          it off after two rows. The dialog itself is short and never scrolls. */}
      <DialogContent ref={setContainer} className="max-w-md overflow-visible">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="size-5 text-primary" aria-hidden="true" />
            {current ? t("titleChange") : t("titleAssign")}
          </DialogTitle>
          <DialogDescription>{t("description", { company: employer?.companyName ?? "" })}</DialogDescription>
        </DialogHeader>

        {loadFailed ? (
          <ErrorState onRetry={() => void load()} />
        ) : loading ? (
          <div className="space-y-2" aria-busy="true">
            <div className="h-4 w-24 animate-pulse rounded bg-muted/50" />
            <div className="h-11 animate-pulse rounded-lg bg-muted/40" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("currentLabel")}</p>
              <p className="text-sm text-foreground">
                {current
                  ? current.superAgentName
                    ? t("agentOption", { name: current.name, superAgent: current.superAgentName })
                    : current.name
                  : <span className="text-amber-700">{t("noAgent")}</span>}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assign-agent-picker">{t("newLabel")}</Label>
              <SearchableSelect
                id="assign-agent-picker"
                options={options}
                value={selected}
                onValueChange={setSelected}
                placeholder={t("placeholder")}
                ariaLabel={t("newLabel")}
                searchPlaceholder={t("searchPlaceholder")}
                emptyMessage={t("empty")}
                container={container}
                modal
              />
              <p className="text-xs text-muted-foreground">{t("jobsNote")}</p>
            </div>

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="max-sm:min-h-11">
                {t("cancel")}
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving || unchanged} className="max-sm:min-h-11">
                {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {saving ? t("saving") : t("save")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
