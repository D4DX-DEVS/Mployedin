"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobSeekersFilterSheet } from "./JobSeekersFilterSheet";
import { Checkbox } from "@/components/ui/checkbox";
import { AiSearchField } from "@/components/shared/AiSearchField";
import { InlineFilterBar, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TableSortControl } from "@/components/shared/TableSortControl";
import { toast } from "sonner";

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
  industry: string;
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
  industry: "",
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

/** Filters on the "Advanced Filters" line. Location and experience sit in the
 *  main bar: they are what admins narrow a hiring brief by first. */
const ADVANCED_KEYS: (keyof JobSeekerFilters)[] = ["nationality", "jobType", "referred"];

const EXPERIENCE_PRESETS = [1, 2, 3, 5, 10];

/**
 * Filters with no field of their own: the search box already matches skills
 * and degree/field, so separate inputs only repeated it. AI search still sets
 * them (a brief can name several at once), and the page shows them as
 * removable chips so they are never invisible.
 */
export const FIELDLESS_FILTER_KEYS: readonly string[] = ["skills", "education"];

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
    experience: [
      { value: "", label: tr("filterExperienceAny") },
      ...EXPERIENCE_PRESETS.map((n) => ({ value: String(n), label: tr("filterExperienceAtLeast", { count: n }) })),
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
  if (filters.industry) chips.push(chip("industry", tr("filterLabelIndustry"), filters.industry));
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [industries, setIndustries] = useState<Array<{ value: string; label: string }>>([{ value: "", label: tr("filterLabelIndustry") }]);

  useEffect(() => {
    const fetchIndustries = async () => {
      try {
        const res = await fetch("/api/admin/job-attributes/industries");
        if (res.ok) {
          const data = await res.json();
          const industryOptions = (data.items ?? []).map((ind: any) => ({
            value: ind.name,
            label: ind.name,
          }));
          setIndustries([{ value: "", label: tr("filterLabelIndustry") }, ...industryOptions]);
        }
      } catch (error) {
        toast.error(tr("failedToLoadIndustries"));
      }
    };
    fetchIndustries();
  }, [tr]);

  const options = filterOptions(tr);
  // Typed or AI-set experience outside the presets still shows as itself.
  const experienceOptions = filters.experienceYears > 0 && !EXPERIENCE_PRESETS.includes(filters.experienceYears)
    ? [...options.experience, { value: String(filters.experienceYears), label: tr("filterExperienceAtLeast", { count: filters.experienceYears }) }]
    : options.experience;
  // Sheet badge: everything in the sheet that is set (search lives outside it).
  const sheetActiveCount = countActiveJobSeekerFilters("", filters) - (filters.skills ? 1 : 0) - (filters.education ? 1 : 0);
  const sort = splitJobSeekerSort(filters.sort);
  const advancedActiveCount = ADVANCED_KEYS
    .filter((key) => filters[key] !== EMPTY_JOB_SEEKER_FILTERS[key])
    .length;

  return (
    <>
    <InlineFilterBar
      // Phones: no box around one line of search + Filters (CSS, so first paint has it).
      className="workspace-panel-surface rounded-2xl border-b-0 max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none"
      // Phones open the sheet instead of the second line.
      moreToggleClassName="max-sm:hidden"
      moreClassName="max-sm:hidden"
      more={(
        <>
          <Input
            aria-label={tr("tableHeaderNationality")}
            placeholder={tr("tableHeaderNationality")}
            value={filters.nationality}
            onChange={(e) => onFiltersChange({ nationality: e.target.value })}
            className={`${INLINE_FILTER_CONTROL} shadow-none`}
          />
          <SearchableSelect
            ariaLabel={tr("filterLabelIndustry")}
            className={INLINE_FILTER_CONTROL}
            options={industries}
            value={filters.industry}
            onValueChange={(value) => onFiltersChange({ industry: value })}
            placeholder={tr("filterLabelIndustry")}
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
        // A line of its own: briefs run long ("civil engineer UAE 2 years"),
        // and squeezed beside six filters the text slid under Ask AI.
        className="basis-full max-sm:basis-0 max-sm:flex-1"
        inputClassName="h-11 rounded-lg bg-card sm:h-9"
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => setSheetOpen(true)}
        aria-label={sheetActiveCount > 0 ? `${tr("filtersShort")} (${sheetActiveCount})` : tr("filtersShort")}
        className={`h-11 shrink-0 gap-1.5 rounded-lg px-3 text-sm sm:hidden ${sheetActiveCount > 0 ? "border-primary/30 bg-primary/10 text-primary" : ""}`}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        {sheetActiveCount > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">{sheetActiveCount}</span>
        ) : (
          <span className="max-[359px]:sr-only">{tr("filtersShort")}</span>
        )}
      </Button>
      {/* contents: from sm up these sit in the bar as before; phones use the sheet. */}
      <div className="contents max-sm:hidden">
      <SearchableSelect
        ariaLabel={tr("filterLabelAvailability")}
        className={INLINE_FILTER_CONTROL}
        options={options.availability}
        value={filters.availability}
        onValueChange={(value) => onFiltersChange({ availability: value })}
        placeholder={tr("filterLabelAvailability")}
      />
      <Input
        aria-label={tr("filterLabelCountryCity")}
        placeholder={tr("filterLabelCountryCity")}
        value={filters.location}
        onChange={(e) => onFiltersChange({ location: e.target.value })}
        className={`${INLINE_FILTER_CONTROL} shadow-none`}
      />
      <SearchableSelect
        ariaLabel={tr("filterLabelIndustry")}
        className={INLINE_FILTER_CONTROL}
        options={industries}
        value={filters.industry}
        onValueChange={(value) => onFiltersChange({ industry: value })}
        placeholder={tr("filterLabelIndustry")}
      />
      <SearchableSelect
        ariaLabel={tr("filterLabelMinExperience")}
        // Wide enough for "Any experience" / "10+ years" without an ellipsis.
        className={`${INLINE_FILTER_CONTROL} min-w-40`}
        options={experienceOptions}
        value={filters.experienceYears > 0 ? String(filters.experienceYears) : ""}
        onValueChange={(value) => onFiltersChange({ experienceYears: Number(value) || 0 })}
        placeholder={tr("filterExperienceAny")}
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
      </div>
    </InlineFilterBar>
    <JobSeekersFilterSheet
      open={sheetOpen}
      onOpenChange={setSheetOpen}
      activeCount={sheetActiveCount}
      availability={filters.availability}
      location={filters.location}
      experienceYears={filters.experienceYears}
      hasCV={filters.hasCV}
      nationality={filters.nationality}
      industry={filters.industry}
      jobType={filters.jobType}
      referred={filters.referred}
      options={{ ...options, experience: experienceOptions }}
      sortField={sort.field}
      sortOrder={sort.order}
      onSortFieldChange={(field) => onFiltersChange({ sort: joinJobSeekerSort(field as JobSeekerSortField, sort.order) })}
      onSortOrderChange={(order) => onFiltersChange({ sort: joinJobSeekerSort(sort.field, order) })}
      onChange={onFiltersChange}
      onClearAll={onClear}
    />
    </>
  );
}
