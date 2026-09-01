"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  ChevronDown, ChevronRight, Filter, MapPin, Search, Sparkles, Wand2, X,
} from "lucide-react";

export interface FilterOption { value: string; label: string }

interface JobsFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  statusOptions: FilterOption[];
  employerOptions: FilterOption[];
  selectedEmployer: string;
  onEmployerChange: (value: string) => void;
  agentOptions: FilterOption[];
  selectedAgent: string;
  onAgentChange: (value: string) => void;
  workMode: string;
  onWorkModeChange: (value: string) => void;
  workModeOptions: FilterOption[];
  employmentType: string;
  onEmploymentTypeChange: (value: string) => void;
  employmentTypeOptions: FilterOption[];
  locationFilter: string;
  onLocationChange: (value: string) => void;
  skillsFilter: string;
  onSkillsChange: (value: string) => void;
  aiQuery: string;
  onAiQueryChange: (value: string) => void;
  isApplyingAiSearch: boolean;
  onApplyAiSearch: () => void;
  onClearAll: () => void;
}

/** Mobile-only bottom sheet holding the jobs filters: basic selects always
    visible, advanced fields + AI search collapsed behind one toggle, and a
    sticky Clear all / Apply footer so long content never hides the actions.
    Filters still apply live; Apply only dismisses the sheet. */
export function JobsFilterSheet(props: JobsFilterSheetProps) {
  const t = useTranslations("adminJobs");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {/* hideClose: the default floating bordered X circle looked oversized —
          a small inline icon button sits flush with the title instead. */}
      <DialogContent hideClose className="flex max-h-[88dvh] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/60 px-4 pb-3 pt-3.5 text-start">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4 text-muted-foreground" />
              {t("filtersButton")}
              {props.activeCount > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{props.activeCount}</Badge>
              )}
            </DialogTitle>
            <DialogClose
              aria-label={t("closeFilters")}
              className="-me-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X className="h-4 w-4" />
            </DialogClose>
          </div>
          <DialogDescription className="sr-only">{t("filterSheetDescription")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="jobs-sheet-search">{t("filterSearchLabel")}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="jobs-sheet-search"
                placeholder={t("searchPlaceholder")}
                value={props.search}
                onChange={(e) => props.onSearchChange(e.target.value)}
                className="h-11 rounded-xl border-border bg-card ps-9 text-sm shadow-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="jobs-sheet-status">{t("filterStatusLabel")}</Label>
            <SearchableSelect
              id="jobs-sheet-status"
              className="h-11 w-full rounded-xl border-border bg-card"
              options={props.statusOptions}
              value={props.status}
              onValueChange={props.onStatusChange}
              placeholder={t("statusFilterPlaceholder")}
            />
          </div>

          {props.employerOptions.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="jobs-sheet-employer">{t("filterEmployerLabel")}</Label>
              <SearchableSelect
                id="jobs-sheet-employer"
                className="h-11 w-full rounded-xl border-border bg-card"
                options={props.employerOptions}
                value={props.selectedEmployer}
                onValueChange={props.onEmployerChange}
                placeholder={t("allEmployers")}
              />
            </div>
          )}

          {props.agentOptions.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="jobs-sheet-agent">{t("filterAgentLabel")}</Label>
              <SearchableSelect
                id="jobs-sheet-agent"
                className="h-11 w-full rounded-xl border-border bg-card"
                options={props.agentOptions}
                value={props.selectedAgent}
                onValueChange={props.onAgentChange}
                placeholder={t("allAgents")}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="jobs-sheet-workmode">{t("filterWorkModeLabel")}</Label>
            <SearchableSelect
              id="jobs-sheet-workmode"
              className="h-11 w-full rounded-xl border-border bg-card"
              options={props.workModeOptions}
              value={props.workMode}
              onValueChange={props.onWorkModeChange}
              placeholder={t("allWorkModes")}
            />
          </div>

          <button
            type="button"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex min-h-11 w-full items-center justify-between rounded-xl border border-border/60 bg-secondary/40 px-3 py-2.5 text-start transition-colors hover:bg-secondary/60"
          >
            <span>
              <span className="block text-sm font-semibold text-foreground">{t("advancedFilters")}</span>
              <span className="block text-[11px] text-muted-foreground">{t("advancedFiltersHint")}</span>
            </span>
            {advancedOpen
              ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />}
          </button>

          {advancedOpen && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="jobs-sheet-type">{t("filterTypeLabel")}</Label>
                <SearchableSelect
                  id="jobs-sheet-type"
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={props.employmentTypeOptions}
                  value={props.employmentType}
                  onValueChange={props.onEmploymentTypeChange}
                  placeholder={t("allTypes")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="jobs-sheet-location">{t("filterLocationLabel")}</Label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="jobs-sheet-location"
                    placeholder={t("locationFilterPlaceholder")}
                    value={props.locationFilter}
                    onChange={(e) => props.onLocationChange(e.target.value)}
                    className="h-11 rounded-xl border-border bg-card ps-9 text-sm shadow-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="jobs-sheet-skills">{t("filterSkillsLabel")}</Label>
                <Input
                  id="jobs-sheet-skills"
                  placeholder={t("skillsFilterPlaceholder")}
                  value={props.skillsFilter}
                  onChange={(e) => props.onSkillsChange(e.target.value)}
                  className="h-11 rounded-xl border-border bg-card text-sm shadow-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="jobs-sheet-ai" className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-sky-500" />
                  {t("aiSearch")}
                </Label>
                <Input
                  id="jobs-sheet-ai"
                  placeholder={t("aiSearchPlaceholder")}
                  value={props.aiQuery}
                  onChange={(e) => props.onAiQueryChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); props.onApplyAiSearch(); } }}
                  className="h-11 rounded-xl border-border bg-card text-sm shadow-none"
                />
                <Button
                  type="button"
                  onClick={props.onApplyAiSearch}
                  disabled={!props.aiQuery.trim() || props.isApplyingAiSearch}
                  className="h-11 w-full gap-2 rounded-xl text-sm font-semibold"
                >
                  <Wand2 className="h-4 w-4" />
                  {props.isApplyingAiSearch ? t("searching") : t("aiSearch")}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-background px-4 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={props.onClearAll}
            disabled={props.activeCount === 0}
            className="h-9 rounded-lg px-3 text-xs text-muted-foreground"
          >
            {t("clearAllFilters")}
          </Button>
          <Button
            size="sm"
            onClick={() => props.onOpenChange(false)}
            className="h-9 gap-1.5 rounded-lg px-4 text-xs font-semibold"
          >
            <Filter className="h-3.5 w-3.5" />
            {props.activeCount > 0
              ? t("applyFiltersWithCount", { count: props.activeCount })
              : t("applyFilters")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
