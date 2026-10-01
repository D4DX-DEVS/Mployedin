"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SearchableSelect } from "@/components/ui/searchable-select";

/** Who is posting on an employer's behalf. Employers post as themselves. */
export type OnBehalfMode = "admin" | "agent";

interface OnBehalfEmployerPickerProps {
  mode: OnBehalfMode;
  /** Employer profile id — what POST /api/jobs stores as job.employerId. */
  value: string;
  onChange: (employerId: string) => void;
}

interface EmployerRow {
  /** Admin rows: the user id. Agent rows: the employer profile id. */
  _id: string;
  /** Admin rows only: the employer profile id. */
  employerProfileId?: string;
  companyName?: string;
  name?: string;
  /** Agent rows only: the agent holds the assignment, not just area visibility. */
  assignedToMe?: boolean;
}

interface EmployerOption {
  value: string;
  label: string;
}

/**
 * The rows each role may post for, as select options.
 *
 * An agent sees every employer in their area on the Employers page, but may
 * only post for the ones assigned to them — POST /api/jobs refuses the rest
 * with a 403, so offering them would only invite that error.
 */
export function employerOptionsFor(mode: OnBehalfMode, rows: readonly EmployerRow[]): EmployerOption[] {
  if (mode === "agent") {
    return rows
      .filter((row) => row.assignedToMe === true)
      .map((row) => ({ value: row._id, label: row.companyName || row.name || row._id }));
  }
  return rows
    .filter((row) => row.employerProfileId)
    .map((row) => ({
      value: row.employerProfileId as string,
      label: row.companyName || row.name || (row.employerProfileId as string),
    }));
}

/**
 * Employer picker for a job posted on someone else's behalf (admin, agent).
 * Loads up to 500 employers in one request: the agent page used to read the
 * API's default page of 10, so an agent's eleventh employer could not be chosen.
 */
export function OnBehalfEmployerPicker({ mode, value, onChange }: OnBehalfEmployerPickerProps) {
  const t = useTranslations("employerJobForm");
  const [options, setOptions] = useState<EmployerOption[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = mode === "admin" ? "/api/employers?limit=500&fields=companyName" : "/api/employers?limit=500";
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { employers?: EmployerRow[]; data?: EmployerRow[] } | null) => {
        if (cancelled) return;
        setOptions(employerOptionsFor(mode, d?.employers ?? d?.data ?? []));
      })
      .catch(() => { /* picker stays empty; submit is blocked with a message */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [mode]);

  return (
    <div className="mt-3 rounded-xl border border-border/70 bg-background/85 shadow-sm chip-pad">
      <label htmlFor="job-form-employer" className="mb-1.5 block text-xs font-medium text-muted-foreground sm:text-sm">
        {t("employerLabel")} <span className="text-destructive">*</span>
      </label>
      <SearchableSelect
        id="job-form-employer"
        options={options}
        value={value}
        onValueChange={onChange}
        placeholder={t("employerPlaceholder")}
        className="w-full"
      />
      {mode === "agent" && loaded && options.length === 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">{t("noAssignedEmployers")}</p>
      )}
    </div>
  );
}
