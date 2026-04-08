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
    <div className="mb-2.5">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-1">
        {label}
      </div>
      {value ? (
        <div className="flex items-center justify-between text-xs rounded-lg border border-border bg-muted/30 px-3 py-2">
          <span className="font-medium text-foreground truncate">{value}</span>
          <Link
            href={editHref}
            className="text-primary text-[11px] shrink-0 ml-2 hover:underline font-medium"
          >
            Edit
          </Link>
        </div>
      ) : (
        <Link
          href={editHref}
          className="flex items-center justify-between text-xs text-primary border border-dashed border-primary/30 bg-primary/[0.03] rounded-lg px-3 py-2 hover:bg-primary/[0.06] transition-colors group"
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
    <label className="flex items-center gap-2.5 py-1.5 text-xs cursor-pointer hover:text-foreground transition-colors group">
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
    <div className="space-y-3">
      {/* ── Your Preferences ──────────────────────── */}
      <div className="card-base">
        <h3 className="text-sm font-bold mb-3 text-foreground">Your preferences</h3>
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
        <PrefItem
          label="Salary range"
          value={salaryLabel}
          editHref={`/${locale}/job-seeker/preferences`}
        />
        {totalExp != null && totalExp > 0 && (
          <PrefItem
            label="Experience"
            value={`${totalExp} year${totalExp !== 1 ? "s" : ""}`}
            editHref={`/${locale}/job-seeker/profile`}
          />
        )}
      </div>

      {/* ── Filters ───────────────────────────────── */}
      <div className="card-base">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-foreground">Filters</h3>
          {activeFilterCount > 0 && (
            <button
              onClick={() =>
                onFiltersChange({ workTypes: [], matchRanges: [], dateRanges: [] })
              }
              className="text-[11px] text-primary hover:underline font-medium"
            >
              Clear all ({activeFilterCount})
            </button>
          )}
        </div>

        <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">
          Work type
        </div>
        <FilterCheckbox label="Remote" checked={filters.workTypes.includes("remote")} onChange={() => toggle("workTypes", "remote")} />
        <FilterCheckbox label="On-site" checked={filters.workTypes.includes("onsite")} onChange={() => toggle("workTypes", "onsite")} />

        <div className="h-px bg-border/60 my-2.5" />

        <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">
          Match score
        </div>
        <FilterCheckbox label="80%+ match" checked={filters.matchRanges.includes("80+")} onChange={() => toggle("matchRanges", "80+")} />
        <FilterCheckbox label="60–79% match" checked={filters.matchRanges.includes("60-79")} onChange={() => toggle("matchRanges", "60-79")} />
        <FilterCheckbox label="Below 60%" checked={filters.matchRanges.includes("below60")} onChange={() => toggle("matchRanges", "below60")} />

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
