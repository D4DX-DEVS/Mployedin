"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AiSearchField } from "@/components/shared/AiSearchField";
import { InlineFilterBar, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TableSortControl } from "@/components/shared/TableSortControl";

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

export type JobSeekerSortField = "joined" | "profile";

/** The API takes one combined `sort` value; the table shows it as a field plus a direction. */
export function splitJobSeekerSort(sort: string): { field: JobSeekerSortField; order: "asc" | "desc" } {
  const field = sort.startsWith("profile") ? "profile" : "joined";
  const order = sort === "oldest" || sort === "profile_low" ? "asc" : "desc";
  return { field, order };
}

export function joinJobSeekerSort(field: JobSeekerSortField, order: "asc" | "desc"): string {
  if (field === "profile") return order === "asc" ? "profile_low" : "profile_high";
  return order === "asc" ? "oldest" : "newest";
}

/** Filters that differ from their default — drives the "N active" badge and Clear.
 *  Sort is not a filter: it has its own control. */
export function countActiveJobSeekerFilters(search: string, filters: JobSeekerFilters): number {
  return (Object.keys(EMPTY_JOB_SEEKER_FILTERS) as (keyof JobSeekerFilters)[])
    .filter((key) => key !== "sort" && filters[key] !== EMPTY_JOB_SEEKER_FILTERS[key])
    .length + (search ? 1 : 0);
}

/** Filters on the "Advanced Filters" line. */
const ADVANCED_KEYS: (keyof JobSeekerFilters)[] = ["location", "experienceYears", "jobType", "referred"];

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
      { value: "joined", label: tr("tableHeaderJoined") },
      { value: "profile", label: tr("tableHeaderProfilePercent") },
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
  onClear?: () => void;
  clearLabel?: string;
  onExportCsv: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  exportExtra?: ReactNode;
  /** Removable chips for filters that have no field (set by AI search). */
  chips?: ReactNode;
}

/**
 * Admin job-seekers filters on the shared InlineFilterBar, same as Jobs,
 * Applications and Interviews: search (+ Ask AI) and the everyday filters
 * always visible, the rest behind "Advanced Filters", Clear + Export pinned
 * right. Replaces the Show/Hide Filters panel inside the page header.
 */
export function JobSeekersFilterPanel({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  aiLoading,
  aiSummary,
  onAiSearch,
  onClear,
  clearLabel,
  onExportCsv,
  onExportExcel,
  onExportPdf,
  exportExtra,
  chips,
}: JobSeekersFilterPanelProps) {
  const tr = useTranslations("adminJobSeekers");
  const options = filterOptions(tr);
  const sort = splitJobSeekerSort(filters.sort);
  const advancedActiveCount = ADVANCED_KEYS
    .filter((key) => filters[key] !== EMPTY_JOB_SEEKER_FILTERS[key])
    .length;

  return (
    <InlineFilterBar
      className="workspace-panel-surface rounded-2xl border-b-0"
      more={(
        <>
          <Input
            aria-label={tr("filterLabelLocation")}
            placeholder={tr("filterLabelLocation")}
            value={filters.location}
            onChange={(e) => onFiltersChange({ location: e.target.value })}
            className={`${INLINE_FILTER_CONTROL} shadow-none`}
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
            className={`${INLINE_FILTER_CONTROL} shadow-none`}
          />
          <SearchableSelect
            ariaLabel={tr("filterLabelJobType")}
            className={INLINE_FILTER_CONTROL}
            options={options.jobType}
            value={filters.jobType}
            onValueChange={(value) => onFiltersChange({ jobType: value })}
            placeholder={tr("filterLabelJobType")}
          />
          <SearchableSelect
            ariaLabel={tr("tableHeaderReferredBy")}
            className={INLINE_FILTER_CONTROL}
            options={options.referred}
            value={filters.referred}
            onValueChange={(value) => onFiltersChange({ referred: value })}
            placeholder={tr("tableHeaderReferredBy")}
          />
        </>
      )}
      moreLabel={tr("advancedFilters")}
      moreActiveCount={advancedActiveCount}
      onClear={onClear}
      clearLabel={clearLabel}
      onExportCsv={onExportCsv}
      onExportExcel={onExportExcel}
      onExportPdf={onExportPdf}
      exportExtra={exportExtra}
      footer={(aiSummary || chips) ? (
        <div className="space-y-2">
          {aiSummary && (
            <p className="rounded-xl bg-primary/5 px-4 py-2.5 text-sm text-primary">
              <Sparkles className="me-1.5 inline-block h-3.5 w-3.5" aria-hidden="true" />
              {tr("aiSummarySuffix", { summary: aiSummary })}
            </p>
          )}
          {chips}
        </div>
      ) : undefined}
    >
      <AiSearchField
        value={search}
        onValueChange={onSearchChange}
        placeholder={tr("searchOrDescribePlaceholder")}
        onAskAi={() => onAiSearch()}
        pending={aiLoading}
        className="flex-[2_1_20rem]"
        inputClassName="h-11 rounded-lg bg-card sm:h-9"
      />
      <SearchableSelect
        ariaLabel={tr("filterLabelAvailability")}
        className={INLINE_FILTER_CONTROL}
        options={options.availability}
        value={filters.availability}
        onValueChange={(value) => onFiltersChange({ availability: value })}
        placeholder={tr("filterLabelAvailability")}
      />
      <label className="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground sm:h-9">
        <Checkbox
          checked={filters.hasCV}
          onCheckedChange={(checked) => onFiltersChange({ hasCV: checked === true })}
        />
        <span className="truncate">{tr("filterHasCvOnly")}</span>
      </label>
      <TableSortControl
        value={sort.field}
        onValueChange={(field) => onFiltersChange({ sort: joinJobSeekerSort(field as JobSeekerSortField, sort.order) })}
        options={options.sort}
        order={sort.order}
        onOrderChange={(order) => onFiltersChange({ sort: joinJobSeekerSort(sort.field, order) })}
        compact
      />
    </InlineFilterBar>
  );
}
