"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FeedFilters {
  workTypes: string[];
  matchRanges: string[];
  dateRanges: string[];
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
}: {
  label: string;
  value?: string;
  editHref: string;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {value ? (
        <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-background px-3 py-2.5 text-xs shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <span className="truncate font-medium text-foreground">{value}</span>
          <Link
            href={editHref}
            className="ml-2 shrink-0 text-[11px] font-medium text-primary hover:underline"
          >
            Edit
          </Link>
        </div>
      ) : (
        <Link
          href={editHref}
          className="group flex items-center justify-between rounded-2xl border border-dashed border-primary/30 bg-primary/[0.03] px-3 py-2.5 text-xs text-primary transition-colors hover:bg-primary/[0.06]"
        >
          <span>+ Set {label.toLowerCase()}</span>
          <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
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

// ── Component ─────────────────────────────────────────────────────────────────

export function JobFeedSidebar({ filters, onFiltersChange, locale }: SidebarProps) {
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
      ? `${profile.preferredSalary.min.toLocaleString()}–${profile.preferredSalary.max.toLocaleString()} ${profile.preferredSalary.currency}`
      : undefined;

  const activeFilterCount =
    filters.workTypes.length + filters.matchRanges.length + filters.dateRanges.length;

  return (
    <div className="space-y-4">
      {/* ── Preferences ── */}
      <div className="card-base rounded-[26px]">
        <div className="mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Profile signal</div>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">Your preferences</h3>
          <p className="mt-1 text-sm text-muted-foreground">These guide what stays high in the feed.</p>
        </div>
        <PrefItem
          label="Preferred role"
          value={profile?.preferredRoles?.join(", ") || undefined}
          editHref={`/${locale}/job-seeker/preferences`}
        />
        <PrefItem
          label="Location"
          value={profile?.preferredCountries?.join(", ") || undefined}
          editHref={`/${locale}/job-seeker/preferences`}
        />
        {totalExp != null && totalExp > 0 && (
          <PrefItem
            label="Experience"
            value={`${totalExp} yr${totalExp !== 1 ? "s" : ""}`}
            editHref={`/${locale}/job-seeker/profile`}
          />
        )}
        <PrefItem
          label="Salary"
          value={salaryLabel}
          editHref={`/${locale}/job-seeker/preferences`}
        />
      </div>

      {/* ── Filters ── */}
      <div className="card-base rounded-[26px]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Refine results</div>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">Filters</h3>
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={() => onFiltersChange({ workTypes: [], matchRanges: [], dateRanges: [] })}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              Clear all ({activeFilterCount})
            </button>
          )}
        </div>

        <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Work type
          </div>
          <FilterCheckbox label="Remote" checked={filters.workTypes.includes("remote")} onChange={() => toggle("workTypes", "remote")} />
          <FilterCheckbox label="On-site" checked={filters.workTypes.includes("onsite")} onChange={() => toggle("workTypes", "onsite")} />
        </div>

        <div className="mt-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Match score
          </div>
          <FilterCheckbox label="80%+ match" checked={filters.matchRanges.includes("80+")} onChange={() => toggle("matchRanges", "80+")} />
          <FilterCheckbox label="60–79% match" checked={filters.matchRanges.includes("60-79")} onChange={() => toggle("matchRanges", "60-79")} />
          <FilterCheckbox label="Below 60%" checked={filters.matchRanges.includes("below60")} onChange={() => toggle("matchRanges", "below60")} />
        </div>

        <div className="h-px bg-border/60 my-2.5" />

        <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">
          Date posted
        </div>
        <FilterCheckbox label="Last 3 days" checked={filters.dateRanges.includes("3days")} onChange={() => toggle("dateRanges", "3days")} />
        <FilterCheckbox label="Last week" checked={filters.dateRanges.includes("week")} onChange={() => toggle("dateRanges", "week")} />
        <FilterCheckbox label="Last month" checked={filters.dateRanges.includes("month")} onChange={() => toggle("dateRanges", "month")} />
      </div>
    </div>
  );
}
