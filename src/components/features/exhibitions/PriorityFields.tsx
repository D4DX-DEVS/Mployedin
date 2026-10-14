"use client";

import { useState } from "react";
import { Info, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { csrfFetch } from "@/lib/security/csrf-client";
import { PRIORITY_ORDER, suggestPriority } from "@/lib/exhibitions/priority";

const LABEL_KEYS: Record<string, string> = {
  low: "priorityLow",
  medium: "priorityMedium",
  high: "priorityHigh",
  critical: "priorityCritical",
};

function usePriorityOptions() {
  const t = useTranslations("exhibitions");
  return PRIORITY_ORDER.map((value) => ({ value, label: t(LABEL_KEYS[value]) }));
}

/** The four levels and who sets them, in one place every role can open. */
export function PriorityCriteria() {
  const t = useTranslations("exhibitions");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary hover:underline sm:min-h-0">
          <Info className="size-3.5" aria-hidden="true" />
          {t("priorityCriteriaTitle")}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2 text-sm" align="start">
        <p className="font-semibold text-foreground">{t("priorityCriteriaTitle")}</p>
        <ul className="space-y-1.5 text-muted-foreground">
          {[...PRIORITY_ORDER].reverse().map((level) => (
            <li key={level}>{t(`priorityCriteria.${level}`)}</li>
          ))}
        </ul>
        <p className="border-t pt-2 text-xs text-muted-foreground">{t("priorityHelp")}</p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The agent's priority choice on the request form, with a suggestion from the
 * event date and expected leads that they can take or ignore.
 */
export function PriorityFormField({
  value,
  onChange,
  eventStartDate,
  expectedLeads,
  container,
}: {
  value: string;
  onChange: (value: string) => void;
  eventStartDate: string;
  expectedLeads: string;
  container?: HTMLElement | null;
}) {
  const t = useTranslations("exhibitions");
  const options = usePriorityOptions();
  const suggestion = suggestPriority(eventStartDate || null, expectedLeads);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <Label htmlFor="exhibition-priority">{t("priority")}</Label>
        <PriorityCriteria />
      </div>
      <SearchableSelect
        id="exhibition-priority"
        options={options}
        value={value}
        onValueChange={onChange}
        ariaLabel={t("priority")}
        container={container}
        modal
      />
      {suggestion.priority !== value && (
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-amber-500" aria-hidden="true" />
          <span>
            {t("prioritySuggested", { priority: t(LABEL_KEYS[suggestion.priority]) })} — {t(`priorityReason.${suggestion.reason}`)}
          </span>
          <button type="button" className="min-h-11 font-semibold text-primary hover:underline sm:min-h-0" onClick={() => onChange(suggestion.priority)}>
            {t("usePriority")}
          </button>
        </p>
      )}
    </div>
  );
}

/**
 * Super agent / admin: change a request's priority in place. The server
 * records who changed it and from what.
 */
export function PriorityPicker({
  requestId,
  value,
  onSaved,
  disabled,
}: {
  requestId: string;
  value: string;
  onSaved: (priority: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("exhibitions");
  const options = usePriorityOptions();
  const [saving, setSaving] = useState(false);

  const save = async (next: string) => {
    if (next === value) return;
    setSaving(true);
    try {
      const res = await csrfFetch(`/api/exhibitions/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? t("priorityChangeError"));
        return;
      }
      toast.success(t("priorityChanged"));
      onSaved(next);
    } catch {
      toast.error(t("priorityChangeError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <SearchableSelect
        options={options}
        value={value}
        onValueChange={(next) => void save(next)}
        ariaLabel={t("changePriority")}
        className="h-9 w-36"
        disabled={disabled || saving}
        modal
      />
      {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
    </div>
  );
}

