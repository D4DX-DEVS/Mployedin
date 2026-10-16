"use client";

/**
 * Summary tiles and the filter bar above the staff background-check list.
 * An agent can work with many employers, so the list narrows by employer,
 * then by that employer's jobs (cascading), check type, who holds the check
 * and status. Every filter lives in the URL (the parent owns it).
 */

import { useTranslations } from "next-intl";
import { CheckCircle2, Clock, Hourglass, PlayCircle, UserCheck, type LucideIcon } from "lucide-react";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Two per row on phones; the shared sizing packs three and squeezes the labels. */
const FILTER_CONTROL = cn(INLINE_FILTER_CONTROL, "max-sm:max-w-none max-sm:flex-[1_1_40%]");

export const FILTER_STATUSES = ["pending", "in_progress", "awaiting_reply", "open", "completed", "cancelled"] as const;
export const FILTER_TYPES = ["background", "reference", "both"] as const;
export const FILTER_HOLDERS = ["me", "unassigned", "others"] as const;

export interface CheckOverview {
  canRun: boolean;
  counts: { pending: number; in_progress: number; awaiting_reply: number; mine: number; completed: number };
  employers: { _id: string; name: string; total: number; open: number }[];
  jobs: { _id: string; employerId: string; title: string; total: number; open: number }[];
}

export interface StaffCheckFilterValues {
  q: string;
  status: string;
  checkType: string;
  holder: string;
  employerId: string;
  jobId: string;
}

type TileKey = keyof CheckOverview["counts"];

const TILES: { key: TileKey; icon: LucideIcon; tone: string; filter: Pick<StaffCheckFilterValues, "status" | "holder"> }[] = [
  { key: "pending", icon: Clock, tone: "text-muted-foreground", filter: { status: "pending", holder: "all" } },
  { key: "in_progress", icon: PlayCircle, tone: "text-sky-700", filter: { status: "in_progress", holder: "all" } },
  { key: "awaiting_reply", icon: Hourglass, tone: "text-amber-700", filter: { status: "awaiting_reply", holder: "all" } },
  { key: "mine", icon: UserCheck, tone: "text-primary", filter: { status: "open", holder: "me" } },
  { key: "completed", icon: CheckCircle2, tone: "text-emerald-700", filter: { status: "completed", holder: "all" } },
];

interface StaffCheckTilesProps {
  overview: CheckOverview | null;
  values: StaffCheckFilterValues;
  /** Applies a tile's status + holder, or clears them when the tile is already on. */
  onPick: (filter: Pick<StaffCheckFilterValues, "status" | "holder">) => void;
}

/** Counts per state across everything the viewer may see; a tile is a one-tap filter. */
export function StaffCheckTiles({ overview, values, onPick }: StaffCheckTilesProps) {
  const t = useTranslations("staffBackgroundChecks");
  // "My open checks" only means something to someone who runs checks.
  const tiles = TILES.filter((tile) => tile.key !== "mine" || overview?.canRun);
  return (
    <section aria-label={t("tilesLabel")} className={cn("grid grid-cols-2 gap-3 sm:gap-4", tiles.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
      {tiles.map(({ key, icon: Icon, tone, filter }) => {
        const active = values.status === filter.status && values.holder === filter.holder;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(active ? { status: "all", holder: "all" } : filter)}
            className={cn(
              "workspace-panel-surface flex min-h-11 flex-col items-start gap-1 rounded-2xl border p-3 text-start transition-colors sm:p-4",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/40",
              // Odd count on the two-column phone grid: the last tile takes the full row.
              tiles.length % 2 === 1 && key === "completed" && "col-span-2 lg:col-span-1",
            )}
          >
            <span className="flex w-full items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
              <Icon className={cn("size-4 shrink-0", tone)} aria-hidden="true" />
              <span className="truncate">{t(`tiles.${key}`)}</span>
            </span>
            <span className="text-lg font-semibold tabular-nums text-foreground sm:text-2xl">
              {overview ? overview.counts[key] : <span className="inline-block h-6 w-8 animate-pulse rounded bg-muted/60 align-middle" />}
            </span>
            <span className="truncate text-xs text-muted-foreground max-sm:hidden">{t(`tileHint.${key}`)}</span>
          </button>
        );
      })}
    </section>
  );
}

interface StaffCheckFilterBarProps {
  overview: CheckOverview | null;
  values: StaffCheckFilterValues;
  onChange: (patch: Partial<StaffCheckFilterValues>) => void;
  onClear: () => void;
  active: boolean;
}

export function StaffCheckFilterBar({ overview, values, onChange, onClear, active }: StaffCheckFilterBarProps) {
  const t = useTranslations("staffBackgroundChecks");
  const employers = overview?.employers ?? [];
  const employerName = new Map(employers.map((e) => [e._id, e.name]));
  // Cascade: with an employer chosen, only that employer's jobs.
  const jobs = (overview?.jobs ?? []).filter((j) => !values.employerId || j.employerId === values.employerId);
  const openSuffix = (open: number) => t("optionOpen", { open });

  const pickEmployer = (employerId: string) => {
    const job = overview?.jobs.find((j) => j._id === values.jobId);
    // A job from another employer would make the list silently empty.
    onChange({ employerId, ...(employerId && job && job.employerId !== employerId ? { jobId: "" } : {}) });
  };

  return (
    <InlineFilterBar onClear={active ? onClear : undefined} clearLabel={t("clearFilters")} className="px-0 pt-0">
      <InlineFilterSearch value={values.q} onChange={(q) => onChange({ q })} placeholder={t("searchPlaceholder")} />
      <SearchableSelect
        id="staff-bg-employer"
        ariaLabel={t("employerLabel")}
        className={FILTER_CONTROL}
        value={values.employerId}
        onValueChange={pickEmployer}
        placeholder={t("employerAll")}
        searchPlaceholder={t("employerSearch")}
        loading={!overview}
        options={[
          { value: "", label: t("employerAll") },
          ...employers.map((e) => ({
            value: e._id,
            label: `${e.name || t("unknownEmployer")} · ${openSuffix(e.open)}`,
            triggerLabel: e.name || t("unknownEmployer"),
          })),
        ]}
      />
      <SearchableSelect
        id="staff-bg-job"
        ariaLabel={t("jobLabel")}
        className={FILTER_CONTROL}
        value={values.jobId}
        onValueChange={(jobId) => {
          const job = overview?.jobs.find((j) => j._id === jobId);
          // Picking a job first fills in its employer, so the two never disagree.
          onChange({ jobId, ...(job && !values.employerId ? { employerId: job.employerId } : {}) });
        }}
        placeholder={t("jobAll")}
        searchPlaceholder={t("jobSearch")}
        loading={!overview}
        options={[
          { value: "", label: t("jobAll") },
          ...jobs.map((j) => {
            const title = j.title || t("unknownJob");
            const company = values.employerId ? "" : employerName.get(j.employerId);
            return {
              value: j._id,
              label: `${title}${company ? ` · ${company}` : ""} · ${openSuffix(j.open)}`,
              triggerLabel: title,
            };
          }),
        ]}
      />
      <Select value={values.status} onValueChange={(status) => onChange({ status })}>
        <SelectTrigger aria-label={t("statusLabel")} className={FILTER_CONTROL}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("statusAll")}</SelectItem>
          {FILTER_STATUSES.map((value) => (
            <SelectItem key={value} value={value}>
              {value === "open" || value === "awaiting_reply" ? t(`statusFilter.${value}`) : t(`status.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={values.checkType} onValueChange={(checkType) => onChange({ checkType })}>
        <SelectTrigger aria-label={t("typeLabel")} className={FILTER_CONTROL}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("typeAll")}</SelectItem>
          {FILTER_TYPES.map((value) => <SelectItem key={value} value={value}>{t(`type.${value}`)}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={values.holder} onValueChange={(holder) => onChange({ holder })}>
        <SelectTrigger aria-label={t("holderLabel")} className={FILTER_CONTROL}>
          <span className="truncate">
            <span className="text-muted-foreground">{t("holderLabel")}: </span>
            {t(`holder.${values.holder}`)}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("holder.all")}</SelectItem>
          {FILTER_HOLDERS.filter((value) => value !== "me" || overview?.canRun).map((value) => (
            <SelectItem key={value} value={value}>{t(`holder.${value}`)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </InlineFilterBar>
  );
}
