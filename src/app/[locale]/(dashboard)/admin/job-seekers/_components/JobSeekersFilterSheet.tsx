"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TableSortControl } from "@/components/shared/TableSortControl";

interface Option { value: string; label: string }

export interface JobSeekersFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCount: number;
  availability: string;
  location: string;
  experienceYears: number;
  hasCV: boolean;
  nationality: string;
  jobType: string;
  referred: string;
  options: {
    availability: Option[];
    experience: Option[];
    jobType: Option[];
    referred: Option[];
    sort: Option[];
  };
  sortField: string;
  sortOrder: "asc" | "desc";
  onSortFieldChange: (field: string) => void;
  onSortOrderChange: (order: "asc" | "desc") => void;
  onChange: (patch: {
    availability?: string;
    location?: string;
    experienceYears?: number;
    hasCV?: boolean;
    nationality?: string;
    jobType?: string;
    referred?: string;
  }) => void;
  onClearAll?: () => void;
}

const CONTROL = "h-11 w-full rounded-xl border-border bg-card text-sm shadow-none";

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/**
 * Phones only: every job-seeker filter and the sort in one sheet, opened from
 * the Filters button beside search — same pattern as admin Jobs. Filters apply
 * live; the footer button only closes the sheet.
 */
export function JobSeekersFilterSheet(props: JobSeekersFilterSheetProps) {
  const tr = useTranslations("adminJobSeekers");
  const tc = useTranslations("common");
  const { options, onChange } = props;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent hideClose className="flex max-h-[88dvh] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/60 px-4 pb-3 pt-3.5 text-start">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {tr("filtersShort")}
              {props.activeCount > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{props.activeCount}</Badge>
              )}
            </DialogTitle>
            <DialogClose
              aria-label={tc("close")}
              className="-me-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X className="h-4 w-4" />
            </DialogClose>
          </div>
          <DialogDescription className="sr-only">{tr("filtersSheetDescription")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <Field id="js-sheet-sort" label={tc("sortBy")}>
            <TableSortControl
              value={props.sortField}
              onValueChange={props.onSortFieldChange}
              options={options.sort}
              order={props.sortOrder}
              onOrderChange={props.onSortOrderChange}
              className="w-full [&_button]:h-11 [&>button:first-child]:min-w-0 [&>button:first-child]:flex-1 [&>button:last-child]:w-11"
            />
          </Field>

          <Field id="js-sheet-availability" label={tr("filterLabelAvailability")}>
            <SearchableSelect
              id="js-sheet-availability"
              className={CONTROL}
              options={options.availability}
              value={props.availability}
              onValueChange={(value) => onChange({ availability: value })}
              placeholder={tr("filterLabelAvailability")}
            />
          </Field>

          <Field id="js-sheet-location" label={tr("filterLabelCountryCity")}>
            <Input
              id="js-sheet-location"
              placeholder={tr("filterLabelCountryCity")}
              value={props.location}
              onChange={(e) => onChange({ location: e.target.value })}
              className={CONTROL}
            />
          </Field>

          <Field id="js-sheet-experience" label={tr("filterLabelMinExperience")}>
            <SearchableSelect
              id="js-sheet-experience"
              className={CONTROL}
              options={options.experience}
              value={props.experienceYears > 0 ? String(props.experienceYears) : ""}
              onValueChange={(value) => onChange({ experienceYears: Number(value) || 0 })}
              placeholder={tr("filterExperienceAny")}
            />
          </Field>

          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 text-sm text-foreground">
            <Checkbox checked={props.hasCV} onCheckedChange={(checked) => onChange({ hasCV: checked === true })} />
            {tr("filterHasCvOnly")}
          </label>

          <Field id="js-sheet-nationality" label={tr("tableHeaderNationality")}>
            <Input
              id="js-sheet-nationality"
              placeholder={tr("tableHeaderNationality")}
              value={props.nationality}
              onChange={(e) => onChange({ nationality: e.target.value })}
              className={CONTROL}
            />
          </Field>

          <Field id="js-sheet-jobtype" label={tr("filterLabelJobType")}>
            <SearchableSelect
              id="js-sheet-jobtype"
              className={CONTROL}
              options={options.jobType}
              value={props.jobType}
              onValueChange={(value) => onChange({ jobType: value })}
              placeholder={tr("filterLabelJobType")}
            />
          </Field>

          <Field id="js-sheet-referred" label={tr("tableHeaderReferredBy")}>
            <SearchableSelect
              id="js-sheet-referred"
              className={CONTROL}
              options={options.referred}
              value={props.referred}
              onValueChange={(value) => onChange({ referred: value })}
              placeholder={tr("tableHeaderReferredBy")}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-background px-4 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5">
          <Button
            variant="ghost"
            onClick={props.onClearAll}
            disabled={!props.onClearAll || props.activeCount === 0}
            className="h-11 rounded-lg px-3 text-sm text-muted-foreground"
          >
            {tr("clearFilters")}
          </Button>
          <Button onClick={() => props.onOpenChange(false)} className="h-11 rounded-lg px-5 text-sm font-semibold">
            {tr("filtersShowResults")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
