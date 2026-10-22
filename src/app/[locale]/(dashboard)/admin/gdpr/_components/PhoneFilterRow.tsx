"use client";

import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface PhoneFilterOption {
  value: string;
  label: string;
}

export interface PhoneFilter {
  key: string;
  /** The field's name: the button's text while the filter is off, and part of its accessible name. */
  label: string;
  value: string;
  /** The option that means "no filter". */
  allValue?: string;
  /** Includes the "all" option; its label names the current state in the accessible name. */
  options: readonly PhoneFilterOption[];
  onChange: (value: string) => void;
}

export interface PhoneSort {
  field: string;
  /** One entry when the table sorts by a single date; several add a "Sort by" group to the menu. */
  fields: readonly PhoneFilterOption[];
  onFieldChange?: (field: string) => void;
  order: "asc" | "desc";
  onOrderChange: (order: "asc" | "desc") => void;
}

interface PhoneFilterRowProps {
  filters: readonly PhoneFilter[];
  sort: PhoneSort;
  className?: string;
}

/** Whole class names, so Tailwind sees them. */
const COLUMNS: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };

const BUTTON =
  "min-h-11 w-full min-w-0 justify-between gap-1 whitespace-normal rounded-lg px-2 py-1 text-start text-[13px] font-normal leading-tight text-foreground";
/** Active: a tint and the chosen value as text, so the state never rests on colour alone. */
const BUTTON_ACTIVE = "border-primary/40 bg-primary/10 font-medium text-primary hover:bg-primary/15";

/**
 * The filters of a list on a phone, as one compact row under the search box:
 * Status, Type and Sort as equal buttons, each opening a small menu. A button
 * reads its field name while the filter is off and the chosen value while it
 * is on (tinted); its accessible name always carries both ("Status: Pending").
 * Sort keeps its direction in the same button ("Newest" / "Oldest") instead of
 * a separate arrow.
 *
 * A grid, not a wrapping flex row: the phone filter-chip rule in globals.css
 * shrinks buttons in a `flex-wrap` row to 30px. Phones only (the caller puts it
 * in InlineFilterBar's `phoneRow`); the desktop controls stay as they were.
 */
export function PhoneFilterRow({ filters, sort, className }: PhoneFilterRowProps) {
  const t = useTranslations("adminGdpr");
  const tCommon = useTranslations("common");
  const descending = sort.order === "desc";
  const OrderIcon = descending ? ArrowDown : ArrowUp;
  const sortField = sort.fields.find((f) => f.value === sort.field)?.label ?? sort.field;
  const orderWord = descending ? t("sortNewest") : t("sortOldest");
  // The first field is the table's default, so "Newest" alone says enough; any other field is named.
  const sortText = sort.fields.length > 1 && sort.field !== sort.fields[0].value ? t("phoneSortFieldName", { field: sortField, order: orderWord }) : orderWord;

  return (
    <div className={cn("grid gap-2", COLUMNS[filters.length + 1] ?? "grid-cols-3", className)} data-phone-filters="">
      {filters.map((filter) => {
        const current = filter.options.find((o) => o.value === filter.value);
        const active = filter.value !== (filter.allValue ?? "all");
        const shown = active ? (current?.label ?? filter.value) : filter.label;
        return (
          <DropdownMenu key={filter.key}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                title={shown}
                aria-label={t("phoneFilterName", { field: filter.label, value: current?.label ?? filter.value })}
                data-active={active ? "true" : undefined}
                className={cn(BUTTON, active && BUTTON_ACTIVE)}
              >
                <span className="line-clamp-2 min-w-0">{shown}</span>
                <ChevronDown className="opacity-60 max-[359px]:hidden" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48">
              <DropdownMenuLabel>{filter.label}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={filter.value} onValueChange={filter.onChange}>
                {filter.options.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value} className="min-h-11">
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            title={sortField}
            aria-label={t(descending ? "phoneSortNameNewest" : "phoneSortNameOldest", { field: sortField })}
            data-order={sort.order}
            className={BUTTON}
          >
            <span className="flex min-w-0 items-center gap-1">
              <OrderIcon className="text-muted-foreground" aria-hidden="true" />
              <span className="line-clamp-2">{sortText}</span>
            </span>
            <ChevronDown className="opacity-60 max-[359px]:hidden" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {sort.fields.length > 1 && (
            <>
              <DropdownMenuLabel>{tCommon("sortBy")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={sort.field} onValueChange={(value) => sort.onFieldChange?.(value)}>
                {sort.fields.map((field) => (
                  <DropdownMenuRadioItem key={field.value} value={field.value} className="min-h-11">
                    {field.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuRadioGroup value={sort.order} onValueChange={(value) => sort.onOrderChange(value === "asc" ? "asc" : "desc")}>
            <DropdownMenuRadioItem value="desc" className="min-h-11">{t("sortNewestFirst")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="asc" className="min-h-11">{t("sortOldestFirst")}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
