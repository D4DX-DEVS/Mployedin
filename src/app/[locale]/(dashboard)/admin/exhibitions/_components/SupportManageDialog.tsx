"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { csrfFetch } from "@/lib/security/csrf-client";
import { DELIVERY_STATUSES } from "@/lib/exhibitions/supportItems";
import {
  DELIVERY_STATUS_KEYS,
  useSupportItemName,
  type SupportItemView,
} from "@/components/features/exhibitions/SupportItemsSummary";
import type { ExhibitionRequest } from "../_lib/exhibitions";

export type SupportDialogMode = "allocate" | "delivery";

interface SupportManageDialogProps {
  mode: SupportDialogMode | null;
  item: ExhibitionRequest | null;
  onClose: () => void;
  /** The saved request, as the server returned it. */
  onSaved: (updated: ExhibitionRequest) => void;
}

export interface SupportRow {
  _id: string;
  allocatedQty: string;
  responsiblePerson: string;
  allocationNote: string;
  deliveryStatus: string;
  deliveredQty: string;
  deliveryNote: string;
}

export const toSupportRow = (entry: SupportItemView): SupportRow => ({
  _id: String(entry._id ?? ""),
  allocatedQty: entry.allocatedQty != null ? String(entry.allocatedQty) : "",
  responsiblePerson: entry.responsiblePerson ?? "",
  allocationNote: entry.allocationNote ?? "",
  deliveryStatus: entry.deliveryStatus ?? "pending",
  deliveredQty: entry.deliveredQty != null ? String(entry.deliveredQty) : "",
  deliveryNote: entry.deliveryNote ?? "",
});

/** The body the support route takes for `mode`. */
export function supportPayload(mode: SupportDialogMode, rows: SupportRow[]) {
  return mode === "allocate"
    ? rows.map((row) => ({
        _id: row._id,
        allocatedQty: row.allocatedQty === "" ? 0 : Number(row.allocatedQty),
        responsiblePerson: row.responsiblePerson.trim(),
        allocationNote: row.allocationNote.trim(),
      }))
    : rows.map((row) => ({
        _id: row._id,
        deliveryStatus: row.deliveryStatus,
        ...(row.deliveredQty !== "" ? { deliveredQty: Number(row.deliveredQty) } : {}),
        deliveryNote: row.deliveryNote.trim(),
      }));
}

/** Saves the rows; returns the updated request, or the server's message. */
export async function saveSupportRows(
  requestId: string,
  mode: SupportDialogMode,
  rows: SupportRow[],
): Promise<{ ok: true; item: ExhibitionRequest } | { ok: false; error?: string }> {
  try {
    const response = await csrfFetch(`/api/exhibitions/${requestId}/support`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: mode, items: supportPayload(mode, rows) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: data.error };
    return { ok: true, item: data as ExhibitionRequest };
  } catch {
    return { ok: false };
  }
}

/**
 * One editor per requested item: allocation (quantity, who is responsible,
 * a note) or delivery (status, quantity delivered, a note). Used by the
 * Manage dialog below and inside the Assign resources / Mark active steps.
 */
export function SupportRowsEditor({
  mode,
  items,
  rows,
  onPatch,
}: {
  mode: SupportDialogMode;
  items: SupportItemView[];
  rows: SupportRow[];
  onPatch: (index: number, change: Partial<SupportRow>) => void;
}) {
  const t = useTranslations("exhibitions");
  const nameOf = useSupportItemName();
  const statusOptions = DELIVERY_STATUSES.map((status) => ({ value: status, label: t(DELIVERY_STATUS_KEYS[status]) }));

  return (
    <div className="space-y-3">
      {items.map((entry, index) => {
        const row = rows[index];
        if (!row) return null;
        const isPeople = entry.item === "volunteers";
        return (
          <div key={row._id || index} className="space-y-2 rounded-lg border border-border/70 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{nameOf(entry)}</p>
              <p className="text-xs text-muted-foreground">
                {t("supportRequestedQty", { count: entry.requestedQty })}
                {mode === "delivery" && ` · ${t("supportAllocatedQty", { count: entry.allocatedQty ?? 0 })}`}
              </p>
            </div>
            {mode === "allocate" ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`alloc-${index}`} className="text-xs">
                      {isPeople ? t("supportPeopleAssigned") : t("allocated")}
                    </Label>
                    <Input
                      id={`alloc-${index}`}
                      inputMode="numeric"
                      value={row.allocatedQty}
                      onChange={(event) => onPatch(index, { allocatedQty: event.target.value.replace(/\D/g, "").slice(0, 6) })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`person-${index}`} className="text-xs">{t("responsible")}</Label>
                    <Input
                      id={`person-${index}`}
                      value={row.responsiblePerson}
                      maxLength={120}
                      onChange={(event) => onPatch(index, { responsiblePerson: event.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor={`anote-${index}`} className="text-xs">{t("allocationNote")}</Label>
                  <Textarea
                    id={`anote-${index}`}
                    rows={2}
                    maxLength={500}
                    value={row.allocationNote}
                    onChange={(event) => onPatch(index, { allocationNote: event.target.value })}
                    placeholder={t("allocationNotePlaceholder")}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">{t("deliveryStatus")}</Label>
                    <SearchableSelect
                      options={statusOptions}
                      value={row.deliveryStatus}
                      onValueChange={(value) => onPatch(index, { deliveryStatus: value })}
                      ariaLabel={`${t("deliveryStatus")}: ${nameOf(entry)}`}
                      modal
                    />
                  </div>
                  <div>
                    <Label htmlFor={`dqty-${index}`} className="text-xs">{t("delivered")}</Label>
                    <Input
                      id={`dqty-${index}`}
                      inputMode="numeric"
                      value={row.deliveredQty}
                      onChange={(event) => onPatch(index, { deliveredQty: event.target.value.replace(/\D/g, "").slice(0, 6) })}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor={`dnote-${index}`} className="text-xs">
                    {t("deliveryNote")}
                    {row.deliveryStatus === "issue" && <span className="text-destructive"> *</span>}
                  </Label>
                  <Textarea
                    id={`dnote-${index}`}
                    rows={2}
                    maxLength={500}
                    value={row.deliveryNote}
                    onChange={(event) => onPatch(index, { deliveryNote: event.target.value })}
                    placeholder={row.deliveryStatus === "issue" ? t("deliveryIssuePlaceholder") : t("deliveryNotePlaceholder")}
                  />
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Admin: record what was allocated against each requested support item
 * (quantity, who is responsible), or how its delivery stands. Nothing counts
 * as allocated or delivered until the server has saved it; its validation
 * message is shown as-is when it refuses (over-allocation, delivered without
 * an allocation, an issue without a note).
 */
export function SupportManageDialog({ mode, item, onClose, onSaved }: SupportManageDialogProps) {
  const t = useTranslations("exhibitions");
  const tc = useTranslations("common");
  const items: SupportItemView[] = item?.supportItems ?? [];
  const [rows, setRows] = useState<SupportRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode && item) {
      setRows((item.supportItems ?? []).map(toSupportRow));
      setError("");
    }
  }, [mode, item]);

  const patch = (index: number, change: Partial<SupportRow>) =>
    setRows((previous) => previous.map((row, i) => (i === index ? { ...row, ...change } : row)));

  const save = async () => {
    if (!item || !mode) return;
    setSaving(true);
    setError("");
    const result = await saveSupportRows(item._id, mode, rows);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? t(mode === "allocate" ? "allocateError" : "deliveryError"));
      return;
    }
    toast.success(t(mode === "allocate" ? "allocateSuccess" : "deliverySuccess"));
    onSaved(result.item);
    onClose();
  };

  return (
    <Dialog open={Boolean(mode && item)} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t(mode === "delivery" ? "updateDelivery" : "allocateResources")}</DialogTitle>
          <DialogDescription>{t(mode === "delivery" ? "deliveryDialogDescription" : "allocateDialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pe-1">
          {mode && <SupportRowsEditor mode={mode} items={items} rows={rows} onPatch={patch} />}
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{tc("cancel")}</Button>
          <Button onClick={() => void save()} disabled={saving || rows.length === 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {t(mode === "delivery" ? "saveDelivery" : "saveAllocation")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
