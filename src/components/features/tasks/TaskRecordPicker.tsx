"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";

/**
 * Picks one candidate, job or employer for a task, searched on the server
 * (/api/agent/tasks/link-options) within what the agent may see. Opening it
 * lists the most recent records; typing narrows by name, email or title.
 */

export type TaskRecordType = "candidate" | "job" | "employer";

export interface PickedRecord {
  id: string;
  label: string;
  /** Jobs only: the job's employer, so the form can fill that picker in. */
  employerId?: string;
  employerName?: string;
}

interface LinkOption {
  value: string;
  label: string;
  sublabel?: string;
  employerId?: string;
  employerName?: string;
  status?: "draft" | "paused" | "closed" | "expired";
}

interface TaskRecordPickerProps {
  type: TaskRecordType;
  value: PickedRecord | null;
  onChange: (record: PickedRecord | null) => void;
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  loadingMessage: string;
  clearLabel: string;
  hint?: string;
  /** Narrow the search: candidates to a job's applicants, jobs to an employer's. */
  jobId?: string;
  employerId?: string;
  /** Inside a Dialog: portal the list into it and trap focus (SearchableSelect). */
  container?: HTMLElement | null;
  modal?: boolean;
}

export function TaskRecordPicker({
  type, value, onChange, label, placeholder, searchPlaceholder, emptyMessage, loadingMessage, clearLabel, hint, jobId, employerId,
  container, modal,
}: TaskRecordPickerProps) {
  const ts = useTranslations("statusBadge");
  const controlId = `task-record-${type}-${useId()}`;
  const hintId = `${controlId}-hint`;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ type, q: query.trim() });
      if (jobId) params.set("jobId", jobId);
      if (employerId) params.set("employerId", employerId);
      fetch(`/api/agent/tasks/link-options?${params}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { options: [] }))
        .then((data: { options?: LinkOption[] }) => setResults(data.options ?? []))
        .catch(() => { /* aborted or offline — keep the last list */ })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [type, query, jobId, employerId]);

  const options = useMemo(() => {
    // The list filters on `label` too, so the email / company rides in it —
    // otherwise a server match on the email would be hidden again.
    const statusWord = (s: LinkOption["status"]) =>
      s === "draft" ? ts("draft") : s === "paused" ? ts("paused") : s === "closed" ? ts("closed") : s === "expired" ? ts("expired") : undefined;
    const list = results.map((o) => {
      const detail = [o.sublabel, statusWord(o.status)].filter(Boolean).join(" · ");
      return { value: o.value, label: detail ? `${o.label} — ${detail}` : o.label, triggerLabel: o.label };
    });
    // Keep the current pick resolvable on the closed trigger.
    if (value && !list.some((o) => o.value === value.id)) {
      list.unshift({ value: value.id, label: value.label, triggerLabel: value.label });
    }
    return list;
  }, [results, value, ts]);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={controlId}>{label}</Label>
      <div className="flex items-center gap-1.5">
        <SearchableSelect
          id={controlId}
          ariaLabel={label}
          ariaDescribedBy={hint ? hintId : undefined}
          options={options}
          value={value?.id ?? ""}
          onValueChange={(id) => {
            if (value && id === value.id) return;
            const picked = results.find((o) => o.value === id);
            onChange(picked ? { id: picked.value, label: picked.label, employerId: picked.employerId, employerName: picked.employerName } : null);
          }}
          searchValue={query}
          onSearchValueChange={setQuery}
          placeholder={placeholder}
          searchPlaceholder={searchPlaceholder}
          emptyMessage={emptyMessage}
          loading={loading}
          loadingMessage={loadingMessage}
          className="min-h-11 sm:min-h-10"
          container={container}
          modal={modal}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={clearLabel}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-10"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {hint && <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
