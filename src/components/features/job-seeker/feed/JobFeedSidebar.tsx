"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRight, ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/ui/intlFormat";

// ── Types ────────────────────────────────────────────────────

export interface FeedFilters {
  workTypes: string[];
  matchRanges: string[];
  dateRanges: string[];
  experienceLevels: string[];
}

interface SidebarProps {
  filters: FeedFilters;
  onFiltersChange: (f: FeedFilters) => void;
  locale: string;
}

interface SeekerProfile {
  preferredRoles?: string[];
  preferredCountries?: string[];
  preferredSalary?: { min: number; max: number; currency: string };
  preferredJobType?: string;
  experience?: Array<{
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
  }>;
}

// ── Small building blocks ─────────────────────────────────────────────────────

function PrefItem({
  label,
  value,
  editHref,
  editLabel,
  setLabel,
}: {
  label: string;
  value?: string;
  editHref: string;
  editLabel: string;
  setLabel: string;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {value ? (
        <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-background text-xs shadow-[0_8px_24px_rgba(15,23,42,0.04)] chip-pad">
          <span className="truncate font-medium text-foreground">{value}</span>
          <Link
            href={editHref}
            className="ms-2 shrink-0 text-[11px] font-medium text-primary hover:underline"
          >
            {editLabel}
          </Link>
        </div>
      ) : (
        <Link
          href={editHref}
          className="group flex items-center justify-between rounded-2xl border border-dashed border-primary/30 bg-primary/[0.03] text-xs text-primary transition-colors hover:bg-primary/[0.06] chip-pad"
        >
          <span>{setLabel}</span>
          <ChevronRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100 rtl:rotate-180" />
        </Link>
      )}
    </div>
  );
}

function FilterCheckbox({
  label,
  checked,
  onChange,
  count,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  count?: number;
}) {
  return (
    <label className="group flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-xs transition-colors hover:bg-muted/40 hover:text-foreground">
      <Checkbox
        checked={checked}
        onCheckedChange={() => onChange()}
        className="h-3.5 w-3.5"
      />
      <span className={`flex-1 ${checked ? "text-foreground font-medium" : "text-muted-foreground"}`}>
        {label}
      </span>
      {count != null && (
        <span className="text-[11px] text-muted-foreground/50 tabular-nums">{count}</span>
      )}
    </label>
  );
}

function FilterGroup({
  title,
  activeCount,
  defaultOpen,
  children,
}: {
  title: string;
  activeCount: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <span className="flex items-center gap-1.5">
          {activeCount > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary tabular-nums">
              {activeCount}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </span>
      </button>
      {open && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function JobFeedSidebar({ filters, onFiltersChange, locale }: SidebarProps) {
  const t = useTranslations("jobFeed.sidebar");
  const { data: profile } = useQuery<SeekerProfile>({
    queryKey: ["seeker-profile-sidebar"],
    queryFn: () => fetch("/api/job-seeker/profile").then((r) => r.json()),
    staleTime: 5 * 60_000,
  });

  const toggle = (key: keyof FeedFilters, value: string) => {
    const list = filters[key];
    const updated = list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];
    onFiltersChange({ ...filters, [key]: updated });
  };

  const totalExp = (() => {
    if (!profile?.experience?.length) return null;
    const yrs = profile.experience.reduce((sum, e) => {
      const s = e.startDate ? new Date(e.startDate).getTime() : 0;
      const end = e.isCurrent ? Date.now() : e.endDate ? new Date(e.endDate).getTime() : 0;
      return s && end ? sum + (end - s) / (365.25 * 24 * 3600_000) : sum;
    }, 0);
    return Math.round(yrs);
  })();

  const salaryLabel =
    profile?.preferredSalary
      ? `${formatCount(profile.preferredSalary.min)}–${formatCount(profile.preferredSalary.max)} ${profile.preferredSalary.currency}`
      : undefined;

  const activeFilterCount =
    filters.workTypes.length +
    filters.matchRanges.length +
    filters.dateRanges.length +
    filters.experienceLevels.length;

  return (
    <div className="space-y-4">
      {/* ── Preferences ── */}
      <div className="card-base rounded-lg sm:rounded-3xl">
        <div className="mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("profileSignal")}</div>
          <h3 className="heading-subsection mt-1 font-semibold tracking-tight text-foreground">{t("preferencesTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("preferencesDescription")}</p>
        </div>
        <PrefItem
          label={t("preferredRole")}
          value={profile?.preferredRoles?.join(", ") || undefined}
          editHref={`/${locale}/job-seeker/preferences`}
          editLabel={t("edit")}
          setLabel={t("setPreferredRole")}
        />
        <PrefItem
          label={t("location")}
          value={profile?.preferredCountries?.join(", ") || undefined}
          editHref={`/${locale}/job-seeker/preferences`}
          editLabel={t("edit")}
          setLabel={t("setLocation")}
        />
        {totalExp != null && totalExp > 0 && (
          <PrefItem
            label={t("experience")}
            value={t("years", { count: totalExp })}
            editHref={`/${locale}/job-seeker/profile`}
            editLabel={t("edit")}
            setLabel={t("setExperience")}
          />
        )}
        <PrefItem
          label={t("salary")}
          value={salaryLabel}
          editHref={`/${locale}/job-seeker/preferences`}
          editLabel={t("edit")}
          setLabel={t("setSalary")}
        />
      </div>

      {/* ── Filters ── */}
      <div className="card-base rounded-lg sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("refineResults")}</div>
            <h3 className="heading-subsection mt-1 font-semibold tracking-tight text-foreground">{t("filters")}</h3>
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={() => onFiltersChange({ workTypes: [], matchRanges: [], dateRanges: [], experienceLevels: [] })}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              {t("clearAll", { count: activeFilterCount })}
            </button>
          )}
        </div>

        <div className="space-y-3">
          <FilterGroup title={t("workType")} activeCount={filters.workTypes.length} defaultOpen>
            <FilterCheckbox label={t("remote")} checked={filters.workTypes.includes("remote")} onChange={() => toggle("workTypes", "remote")} />
            <FilterCheckbox label={t("onsite")} checked={filters.workTypes.includes("onsite")} onChange={() => toggle("workTypes", "onsite")} />
          </FilterGroup>

          <FilterGroup title={t("experienceLevel")} activeCount={filters.experienceLevels.length}>
            <FilterCheckbox label={t("entryLevel")} checked={filters.experienceLevels.includes("entry")} onChange={() => toggle("experienceLevels", "entry")} />
            <FilterCheckbox label={t("midLevel")} checked={filters.experienceLevels.includes("mid")} onChange={() => toggle("experienceLevels", "mid")} />
            <FilterCheckbox label={t("seniorLevel")} checked={filters.experienceLevels.includes("senior")} onChange={() => toggle("experienceLevels", "senior")} />
          </FilterGroup>

          <FilterGroup title={t("matchScore")} activeCount={filters.matchRanges.length}>
            <FilterCheckbox label={t("match80")} checked={filters.matchRanges.includes("80+")} onChange={() => toggle("matchRanges", "80+")} />
            <FilterCheckbox label={t("match60")} checked={filters.matchRanges.includes("60-79")} onChange={() => toggle("matchRanges", "60-79")} />
            <FilterCheckbox label={t("below60")} checked={filters.matchRanges.includes("below60")} onChange={() => toggle("matchRanges", "below60")} />
          </FilterGroup>

          <FilterGroup title={t("datePosted")} activeCount={filters.dateRanges.length}>
            <FilterCheckbox label={t("last3Days")} checked={filters.dateRanges.includes("3days")} onChange={() => toggle("dateRanges", "3days")} />
            <FilterCheckbox label={t("lastWeek")} checked={filters.dateRanges.includes("week")} onChange={() => toggle("dateRanges", "week")} />
            <FilterCheckbox label={t("lastMonth")} checked={filters.dateRanges.includes("month")} onChange={() => toggle("dateRanges", "month")} />
          </FilterGroup>
        </div>
      </div>
    </div>
  );
}
