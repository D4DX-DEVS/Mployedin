"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Filter, Loader2, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";

export interface JobSeekerFilters {
  skills: string;
  location: string;
  availability: string;
  jobType: string;
  sort: string;
  hasCV: boolean;
  referred: string;
  education: string;
  nationality: string;
  experienceYears: number;
}

export const EMPTY_JOB_SEEKER_FILTERS: JobSeekerFilters = {
  skills: "",
  location: "",
  availability: "",
  jobType: "",
  sort: "newest",
  hasCV: false,
  referred: "",
  education: "",
  nationality: "",
  experienceYears: 0,
};

/** Filters that differ from their default — drives the "N active" badge and Clear. */
export function countActiveJobSeekerFilters(search: string, filters: JobSeekerFilters): number {
  return (Object.keys(EMPTY_JOB_SEEKER_FILTERS) as (keyof JobSeekerFilters)[])
    .filter((key) => filters[key] !== EMPTY_JOB_SEEKER_FILTERS[key])
    .length + (search ? 1 : 0);
}

/** Filters that live behind "More filters". */
const ADVANCED_KEYS: (keyof JobSeekerFilters)[] = ["jobType", "referred"];

/**
 * Filters with no field of their own: the search box already matches skills,
 * nationality and degree/field, so separate inputs only repeated it. AI search
 * still sets them (a brief can name several at once), and the page shows them
 * as removable chips so they are never invisible.
 */
export const FIELDLESS_FILTER_KEYS: readonly string[] = ["skills", "nationality", "education"];

type Translate = ReturnType<typeof useTranslations<"adminJobSeekers">>;

function filterOptions(tr: Translate) {
  return {
    availability: [
      { value: "", label: tr("filterLabelAvailability") },
      { value: "immediately", label: tr("availabilityImmediately") },
      { value: "within_month", label: tr("availabilityWithinMonth") },
      { value: "within_3_months", label: tr("availabilityWithin3Months") },
      { value: "not_available", label: tr("availabilityNotAvailable") },
    ],
    referred: [
      { value: "", label: tr("tableHeaderReferredBy") },
      { value: "any", label: tr("filterReferredAny") },
      { value: "agent", label: tr("filterReferredAgent") },
      { value: "super_agent", label: tr("filterReferredSuperAgent") },
      { value: "none", label: tr("filterReferredNone") },
    ],
    jobType: [
      { value: "", label: tr("filterLabelJobType") },
      { value: "remote", label: tr("jobTypeRemote") },
      { value: "hybrid", label: tr("jobTypeHybrid") },
      { value: "onsite", label: tr("jobTypeOnsite") },
    ],
    sort: [
      { value: "newest", label: tr("sortNewest") },
      { value: "oldest", label: tr("sortOldest") },
      { value: "profile_high", label: tr("sortProfileHigh") },
      { value: "profile_low", label: tr("sortProfileLow") },
    ],
  };
}

export interface JobSeekerFilterChip {
  key: string;
  label: string;
  /** Resets just this filter. */
  clear: Partial<JobSeekerFilters> | "search";
}

/** One removable chip per active filter, so the list's state reads at a glance. */
export function buildJobSeekerFilterChips(
  tr: Translate,
  search: string,
  filters: JobSeekerFilters,
): JobSeekerFilterChip[] {
  const options = filterOptions(tr);
  const optionLabel = (list: { value: string; label: string }[], value: string) =>
    list.find((o) => o.value === value)?.label ?? value;
  const chip = (key: keyof JobSeekerFilters, field: string, value: string): JobSeekerFilterChip => ({
    key,
    label: tr("filterChipLabel", { label: field, value }),
    clear: { [key]: EMPTY_JOB_SEEKER_FILTERS[key] },
  });

  const chips: JobSeekerFilterChip[] = [];
  if (search) chips.push({ key: "search", label: tr("filterChipLabel", { label: tr("filterChipSearch"), value: search }), clear: "search" });
  if (filters.availability) chips.push(chip("availability", tr("filterLabelAvailability"), optionLabel(options.availability, filters.availability)));
  if (filters.jobType) chips.push(chip("jobType", tr("filterLabelJobType"), optionLabel(options.jobType, filters.jobType)));
  if (filters.skills) chips.push(chip("skills", tr("filterLabelSkills"), filters.skills));
  if (filters.location) chips.push(chip("location", tr("filterLabelLocation"), filters.location));
  if (filters.sort !== EMPTY_JOB_SEEKER_FILTERS.sort) chips.push(chip("sort", tr("filterLabelSort"), optionLabel(options.sort, filters.sort)));
  if (filters.referred) chips.push(chip("referred", tr("tableHeaderReferredBy"), optionLabel(options.referred, filters.referred)));
  if (filters.nationality) chips.push(chip("nationality", tr("tableHeaderNationality"), filters.nationality));
  if (filters.education) chips.push(chip("education", tr("exportColumnHeaderEducation"), filters.education));
  if (filters.experienceYears > 0) chips.push(chip("experienceYears", tr("filterLabelMinExperience"), String(filters.experienceYears)));
  if (filters.hasCV) chips.push({ key: "hasCV", label: tr("filterHasCvOnly"), clear: { hasCV: false } });
  return chips;
}

interface JobSeekersFilterPanelProps {
  search: string;
  onSearchChange: (value: string) => void;
  filters: JobSeekerFilters;
  onFiltersChange: (patch: Partial<JobSeekerFilters>) => void;
  aiLoading: boolean;
  aiSummary: string | null;
  /** Reads the search box as a plain-language brief and turns it into filters. */
  onAiSearch: () => void;
}

const FIELD_CONTROL = "h-11 w-full rounded-xl border-border bg-card text-sm shadow-none";

/**
 * Expandable filter panel for the admin job-seekers list, same shape as the
 * admin jobs / applications panels: one search row, then one compact row of
 * filters with no label row above it — each empty option names its field
 * ("Availability", "Job Type"), as on those pages. One search box serves both
 * modes: typing filters by keyword as you go, "AI search" reads the same text
 * as a brief.
 */
export function JobSeekersFilterPanel({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  aiLoading,
  aiSummary,
  onAiSearch,
}: JobSeekersFilterPanelProps) {
  const tr = useTranslations("adminJobSeekers");
  const options = filterOptions(tr);
  const advancedActiveCount = ADVANCED_KEYS
    .filter((key) => filters[key] !== EMPTY_JOB_SEEKER_FILTERS[key])
    .length;
  // Phones only: the two rarely-set filters wait behind "More filters". From
  // `sm` up all seven share the row(s). Follows the filters until toggled, so
  // an AI search that sets one never leaves it hidden.
  const [advancedToggled, setAdvancedToggled] = useState<boolean | null>(null);
  const showAdvanced = advancedToggled ?? advancedActiveCount > 0;
  const advancedClass = showAdvanced ? "" : "max-sm:hidden";

  return (
    <div className="mt-4 space-y-3 rounded-3xl border border-border/30 bg-background/40 backdrop-blur-sm card-pad">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label={tr("searchOrDescribePlaceholder")}
            placeholder={tr("searchOrDescribePlaceholder")}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className={`${FIELD_CONTROL} ps-9`}
          />
        </div>
        <Button
          type="button"
          onClick={onAiSearch}
          disabled={aiLoading || !search.trim()}
          title={tr("aiSearchTitle")}
          className="h-11 gap-2 rounded-xl px-4 text-sm font-semibold"
        >
          {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {tr("aiSearchButton")}
        </Button>
      </div>

      {aiSummary && (
        <p className="rounded-xl bg-primary/5 px-4 py-2.5 text-sm text-primary">
          <Sparkles className="me-1.5 inline-block h-3.5 w-3.5" aria-hidden="true" />
          {tr("aiSummarySuffix", { summary: aiSummary })}
        </p>
      )}

      {/* xl: selects and the checkbox size to their text; the two text inputs
          share what is left. Seven equal columns cut "Referred by" and
          "Newest First" short at 1280px. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 xl:grid-cols-[minmax(6rem,1fr)_auto_minmax(6rem,1fr)_auto_auto_auto_auto]">
        <Input
          aria-label={tr("filterLabelLocation")}
          placeholder={tr("filterLabelLocation")}
          value={filters.location}
          onChange={(e) => onFiltersChange({ location: e.target.value })}
          className={FIELD_CONTROL}
        />
        <SearchableSelect
          ariaLabel={tr("filterLabelAvailability")}
          className={FIELD_CONTROL}
          options={options.availability}
          value={filters.availability}
          onValueChange={(value) => onFiltersChange({ availability: value })}
          placeholder={tr("filterLabelAvailability")}
        />
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={50}
          aria-label={tr("filterLabelMinExperience")}
          placeholder={tr("filterLabelMinExperience")}
          value={filters.experienceYears > 0 ? String(filters.experienceYears) : ""}
          onChange={(e) => onFiltersChange({ experienceYears: Math.max(0, Number(e.target.value) || 0) })}
          className={FIELD_CONTROL}
        />
        <div className={advancedClass}>
          <SearchableSelect
            ariaLabel={tr("filterLabelJobType")}
            className={FIELD_CONTROL}
            options={options.jobType}
            value={filters.jobType}
            onValueChange={(value) => onFiltersChange({ jobType: value })}
            placeholder={tr("filterLabelJobType")}
          />
        </div>
        <div className={advancedClass}>
          <SearchableSelect
            ariaLabel={tr("tableHeaderReferredBy")}
            className={FIELD_CONTROL}
            options={options.referred}
            value={filters.referred}
            onValueChange={(value) => onFiltersChange({ referred: value })}
            placeholder={tr("tableHeaderReferredBy")}
          />
        </div>
        <SearchableSelect
          ariaLabel={tr("filterLabelSort")}
          className={FIELD_CONTROL}
          options={options.sort}
          value={filters.sort}
          onValueChange={(value) => onFiltersChange({ sort: value || "newest" })}
          placeholder={tr("sortNewest")}
        />
        <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm text-foreground">
          <Checkbox
            checked={filters.hasCV}
            onCheckedChange={(checked) => onFiltersChange({ hasCV: checked === true })}
          />
          <span className="truncate">{tr("filterHasCvOnly")}</span>
        </label>
      </div>

      <button
        type="button"
        onClick={() => setAdvancedToggled(!showAdvanced)}
        aria-expanded={showAdvanced}
        className="flex min-h-9 items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:hidden"
      >
        <Filter className="h-3.5 w-3.5" aria-hidden="true" />
        {showAdvanced ? tr("fewerFilters") : tr("moreFilters")}
        {advancedActiveCount > 0 && (
          <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary">
            {tr("activeFiltersBadge", { count: advancedActiveCount })}
          </span>
        )}
        {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
    </div>
  );
}
