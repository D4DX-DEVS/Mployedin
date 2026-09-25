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
const ADVANCED_KEYS: (keyof JobSeekerFilters)[] = ["skills", "nationality", "education", "jobType", "referred"];

type Translate = ReturnType<typeof useTranslations<"adminJobSeekers">>;

function filterOptions(tr: Translate) {
  return {
    availability: [
      { value: "", label: tr("filterPlaceholderAll") },
      { value: "immediately", label: tr("availabilityImmediately") },
      { value: "within_month", label: tr("availabilityWithinMonth") },
      { value: "within_3_months", label: tr("availabilityWithin3Months") },
      { value: "not_available", label: tr("availabilityNotAvailable") },
    ],
    referred: [
      { value: "", label: tr("filterReferredAll") },
      { value: "any", label: tr("filterReferredAny") },
      { value: "agent", label: tr("filterReferredAgent") },
      { value: "super_agent", label: tr("filterReferredSuperAgent") },
      { value: "none", label: tr("filterReferredNone") },
    ],
    jobType: [
      { value: "", label: tr("filterPlaceholderAll") },
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

const FIELD_LABEL = "mb-1 block text-xs font-medium text-muted-foreground";
const FIELD_CONTROL = "h-11 w-full rounded-xl border-border bg-card text-sm shadow-none";

/**
 * Expandable filter panel for the admin job-seekers list, same shape as the
 * admin jobs / applications panels. One search box serves both modes: typing
 * filters by keyword as you go, "AI search" reads the same text as a brief.
 * Filters that narrow the list on real data sit up front; the rarely-set ones
 * (job type, referral) wait behind "More filters".
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
  // Follows the filters until the admin toggles it: an AI search that sets
  // nationality or education must not leave those fields hidden.
  const [advancedToggled, setAdvancedToggled] = useState<boolean | null>(null);
  const showAdvanced = advancedToggled ?? advancedActiveCount > 0;

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

      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-5">
        <div>
          <label htmlFor="js-filter-location" className={FIELD_LABEL}>{tr("filterLabelLocation")}</label>
          <Input
            id="js-filter-location"
            value={filters.location}
            onChange={(e) => onFiltersChange({ location: e.target.value })}
            placeholder={tr("filterPlaceholderLocation")}
            className={FIELD_CONTROL}
          />
        </div>
        <div>
          <label htmlFor="js-filter-availability" className={FIELD_LABEL}>{tr("filterLabelAvailability")}</label>
          <SearchableSelect
            id="js-filter-availability"
            ariaLabel={tr("filterLabelAvailability")}
            className={FIELD_CONTROL}
            options={options.availability}
            value={filters.availability}
            onValueChange={(value) => onFiltersChange({ availability: value })}
            placeholder={tr("filterPlaceholderAll")}
          />
        </div>
        <div>
          <label htmlFor="js-filter-experience" className={FIELD_LABEL}>{tr("filterLabelMinExperience")}</label>
          <Input
            id="js-filter-experience"
            type="number"
            inputMode="numeric"
            min={0}
            max={50}
            value={filters.experienceYears > 0 ? String(filters.experienceYears) : ""}
            onChange={(e) => onFiltersChange({ experienceYears: Math.max(0, Number(e.target.value) || 0) })}
            placeholder="0"
            className={FIELD_CONTROL}
          />
        </div>
        <div>
          <label htmlFor="js-filter-sort" className={FIELD_LABEL}>{tr("filterLabelSort")}</label>
          <SearchableSelect
            id="js-filter-sort"
            ariaLabel={tr("filterLabelSort")}
            className={FIELD_CONTROL}
            options={options.sort}
            value={filters.sort}
            onValueChange={(value) => onFiltersChange({ sort: value || "newest" })}
            placeholder={tr("sortNewest")}
          />
        </div>
        <div className="flex flex-col justify-end">
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm text-foreground">
            <Checkbox
              checked={filters.hasCV}
              onCheckedChange={(checked) => onFiltersChange({ hasCV: checked === true })}
            />
            {tr("filterHasCvOnly")}
          </label>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setAdvancedToggled(!showAdvanced)}
        aria-expanded={showAdvanced}
        className="flex min-h-9 items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Filter className="h-3.5 w-3.5" aria-hidden="true" />
        {tr("moreFilters")}
        {advancedActiveCount > 0 && (
          <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary">
            {tr("activeFiltersBadge", { count: advancedActiveCount })}
          </span>
        )}
        {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-5">
          <div>
            <label htmlFor="js-filter-skills" className={FIELD_LABEL}>{tr("filterLabelSkills")}</label>
            <Input
              id="js-filter-skills"
              value={filters.skills}
              onChange={(e) => onFiltersChange({ skills: e.target.value })}
              placeholder={tr("filterPlaceholderSkills")}
              className={FIELD_CONTROL}
            />
          </div>
          <div>
            <label htmlFor="js-filter-nationality" className={FIELD_LABEL}>{tr("tableHeaderNationality")}</label>
            <Input
              id="js-filter-nationality"
              value={filters.nationality}
              onChange={(e) => onFiltersChange({ nationality: e.target.value })}
              placeholder={tr("filterPlaceholderNationality")}
              className={FIELD_CONTROL}
            />
          </div>
          <div>
            <label htmlFor="js-filter-education" className={FIELD_LABEL}>{tr("exportColumnHeaderEducation")}</label>
            <Input
              id="js-filter-education"
              value={filters.education}
              onChange={(e) => onFiltersChange({ education: e.target.value })}
              placeholder={tr("filterPlaceholderEducation")}
              className={FIELD_CONTROL}
            />
          </div>
          <div>
            <label htmlFor="js-filter-job-type" className={FIELD_LABEL}>{tr("filterLabelJobType")}</label>
            <SearchableSelect
              id="js-filter-job-type"
              ariaLabel={tr("filterLabelJobType")}
              className={FIELD_CONTROL}
              options={options.jobType}
              value={filters.jobType}
              onValueChange={(value) => onFiltersChange({ jobType: value })}
              placeholder={tr("filterPlaceholderAll")}
            />
          </div>
          <div>
            <label htmlFor="js-filter-referred" className={FIELD_LABEL}>{tr("tableHeaderReferredBy")}</label>
            <SearchableSelect
              id="js-filter-referred"
              ariaLabel={tr("tableHeaderReferredBy")}
              className={FIELD_CONTROL}
              options={options.referred}
              value={filters.referred}
              onValueChange={(value) => onFiltersChange({ referred: value })}
              placeholder={tr("filterReferredAll")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
