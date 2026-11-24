"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { useDebounce } from "@/hooks/useDebounce";

/** A job the admin picked to find seekers for. */
export interface PickedJob {
  id: string;
  title: string;
  company?: string;
  city?: string;
}

interface AdminJobRow {
  _id: string;
  title?: string;
  status?: string;
  location?: { city?: string };
  employerId?: { companyName?: string } | null;
}

const jobLabel = (job: PickedJob): string => [job.title, job.company, job.city].filter(Boolean).join(" · ");

interface JobPickerFieldProps {
  value: PickedJob | null;
  onChange: (job: PickedJob | null) => void;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  /** Render the list inside this element (needed inside a dialog). */
  container?: HTMLElement | null;
  /** True inside a dialog, so the list takes focus and scroll from it. */
  modal?: boolean;
}

/**
 * Finds a job by title or client name (admin jobs search) and hands back the
 * one picked. Searches as the admin types; shows the 10 newest matches.
 */
export function JobPickerField({ value, onChange, id, ariaLabel, placeholder, className, container, modal }: JobPickerFieldProps) {
  const tr = useTranslations("adminJobSeekers");
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);
  const [jobs, setJobs] = useState<PickedJob[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "10" });
    if (debounced.trim()) params.set("search", debounced.trim());
    setLoading(true);
    fetch(`/api/admin/jobs?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { jobs: [] }))
      .then((data: { jobs?: AdminJobRow[] }) => {
        setJobs((data.jobs ?? []).map((job) => ({
          id: String(job._id),
          title: job.title ?? "",
          company: job.employerId?.companyName,
          city: job.location?.city,
        })));
      })
      .catch(() => {
        // Aborted by the next keystroke, or offline: the list keeps what it had.
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debounced]);

  const options = useMemo<SearchableSelectOption[]>(() => {
    const list = value && !jobs.some((job) => job.id === value.id) ? [value, ...jobs] : jobs;
    return list.map((job) => ({ value: job.id, label: jobLabel(job) }));
  }, [jobs, value]);

  return (
    <SearchableSelect
      id={id}
      ariaLabel={ariaLabel ?? tr("jobPickerLabel")}
      className={className}
      options={options}
      value={value?.id ?? ""}
      onValueChange={(picked) => {
        if (!picked) return onChange(null);
        const job = jobs.find((j) => j.id === picked) ?? (value?.id === picked ? value : null);
        onChange(job);
      }}
      searchValue={query}
      onSearchValueChange={setQuery}
      placeholder={placeholder ?? tr("jobPickerPlaceholder")}
      searchPlaceholder={tr("jobPickerSearch")}
      emptyMessage={tr("jobPickerEmpty")}
      loading={loading}
      loadingMessage={tr("jobPickerLoading")}
      container={container}
      modal={modal}
    />
  );
}
