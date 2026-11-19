"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { CvExportDialog } from "@/components/shared/CvExport/CvExportDialog";
import { ExportCvsButton, SelectionBar } from "@/components/shared/SelectionBar";
import type { PageSelectionState } from "@/hooks/useRowSelection";
import type { CvDetails } from "@/lib/cv/cvZip";
import type { ExportColumn } from "@/lib/export";

/**
 * Row selection and CV export for the agent and super agent job seeker lists
 * (owner decision 3A). The pages own the list and the ticked rows
 * (`useRowSelection`); the pieces here are the checkboxes and the bar + dialog.
 * Whether a seeker may be exported is the server's call (the manifest checks
 * every id against the person's scope), so nothing is filtered here.
 */

const checkedOf = (state: PageSelectionState) => (state === "all" ? true : state === "some" ? "indeterminate" : false);

/** The table's header checkbox: every row of the page, or none. */
export function SeekerPageCheckbox({ state, onToggle }: { state: PageSelectionState; onToggle: () => void }) {
  const t = useTranslations("selectionBar");
  return (
    <Checkbox
      className="tap-target-box"
      checked={checkedOf(state)}
      onCheckedChange={onToggle}
      aria-label={t("selectAllOnPage")}
    />
  );
}

/** One table row's checkbox. */
export function SeekerRowCheckbox({ checked, onToggle, name }: { checked: boolean; onToggle: () => void; name: string }) {
  const t = useTranslations("selectionBar");
  return (
    <Checkbox
      className="tap-target-box"
      checked={checked}
      onCheckedChange={onToggle}
      aria-label={t("selectRow", { name })}
    />
  );
}

/**
 * Phones have no header row, so the page's select-all sits above the cards.
 * The whole row is the 44px target.
 */
export function SeekerSelectAllRow({ state, onToggle }: { state: PageSelectionState; onToggle: () => void }) {
  const t = useTranslations("selectionBar");
  return (
    <label className="mb-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border/70 bg-card px-3 text-sm font-medium sm:hidden">
      <Checkbox checked={checkedOf(state)} onCheckedChange={onToggle} aria-label={t("selectAllOnPage")} />
      {t("selectAllOnPage")}
    </label>
  );
}

/**
 * The columns a page already exports as CSV/Excel, as the CV export's
 * candidate details sheet, keyed by seeker id (rows are matched to candidates
 * by id, never by position).
 */
export function detailsFromColumns<T>(columns: readonly ExportColumn<T>[], rows: readonly T[], idOf: (row: T) => string): CvDetails {
  const cell = (row: T, column: ExportColumn<T>): string => {
    const raw = row[column.key];
    if (column.formatter) return column.formatter(raw, row);
    return raw == null ? "" : String(raw);
  };
  return {
    header: columns.map((column) => column.header),
    rowsById: new Map(rows.map((row) => [idOf(row), columns.map((column) => cell(row, column))])),
  };
}

interface SeekerCvExportProps<T> {
  /** The ticked rows (from `useRowSelection`). */
  selection: { items: readonly T[]; count: number; clear: () => void };
  /** The JobSeeker profile id: what the CV routes and the manifest take. */
  idOf: (row: T) => string;
  /** The name the list shows; it names a candidate the manifest refuses. */
  nameOf: (row: T) => string | undefined;
  /** The columns the page exports as a sheet; they become the ZIP's `candidates.xlsx`. */
  columns?: readonly ExportColumn<T>[];
}

/**
 * "N selected · Clear · Export CVs", sticky at the bottom of the page, and the
 * export dialog it opens (Standardised / Original / Both, at most 50). Put it
 * after the pagination. The selection is cleared once the ZIP was downloaded.
 */
export function SeekerCvExport<T>({ selection, idOf, nameOf, columns }: SeekerCvExportProps<T>) {
  const [open, setOpen] = useState(false);
  // Rebuilt each render: the dialog reads them through refs and keys on the ids.
  const items = selection.items.map((row) => ({ seekerId: idOf(row), name: nameOf(row) }));
  const detailsRows = columns ? detailsFromColumns(columns, selection.items, idOf) : undefined;

  return (
    <>
      <SelectionBar count={selection.count} onClear={selection.clear}>
        <ExportCvsButton count={selection.count} onClick={() => setOpen(true)} />
      </SelectionBar>
      <CvExportDialog open={open} onOpenChange={setOpen} items={items} detailsRows={detailsRows} onExported={selection.clear} />
    </>
  );
}
