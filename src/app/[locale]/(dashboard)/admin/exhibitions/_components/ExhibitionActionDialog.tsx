"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2, MessageSquarePlus } from "lucide-react";
import { getAllocationSummary, type SupportItem } from "@/lib/exhibitions/supportItems";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { csrfFetch } from "@/lib/security/csrf-client";
import { ADMIN_NEXT_STEP } from "@/lib/exhibitions/transitions";
import { STATUS_LABEL_KEYS, formatMoney, type ExhibitionRequest } from "../_lib/exhibitions";
import { SupportRowsEditor, saveSupportRows, toSupportRow, type SupportRow } from "./SupportManageDialog";

interface ExhibitionActionDialogProps {
  item: ExhibitionRequest | null;
  /** The status the admin is moving the request to. */
  status: string;
  onClose: () => void;
  onDone: () => void;
}

const REASON_REQUIRED = ["rejected", "revision_requested"];
const BUDGET_STEPS = ["approved", "budget_approved"];

/** The dialog title for a move: the action's own name, not "Move to …". */
function titleKey(from: string, to: string): string {
  if (to === "rejected") return "confirmRejection";
  if (to === "revision_requested") return "requestChanges";
  if (to === "archived") return "archiveRequest";
  if (to === "under_review" && from === "submitted") return "startReview";
  const next = ADMIN_NEXT_STEP[from as keyof typeof ADMIN_NEXT_STEP];
  return next?.status === to ? next.labelKey : "approveAction";
}

/**
 * Confirms one workflow move and collects what that step needs: the reason
 * for a rejection or send-back (the server refuses those without one; any
 * other note is optional and folded away); for Approve payment the amount the
 * company allocates and what each requested support item gets, in one step
 * (owner, 2026-10-15: it used to be Approve budget, Assign resources and Mark
 * active).
 */
export function ExhibitionActionDialog({ item, status, onClose, onDone }: ExhibitionActionDialogProps) {
  const t = useTranslations("adminExhibitions");
  const tx = useTranslations("exhibitions");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [approvedBudget, setApprovedBudget] = useState("");
  const [budgetNotes, setBudgetNotes] = useState("");
  const [budgetError, setBudgetError] = useState("");
  const [rows, setRows] = useState<SupportRow[]>([]);
  const [rowsError, setRowsError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setNote("");
    setShowNote(false);
    setBudgetError("");
    // Prefer the super-agent's recommendation over the raw request when no
    // binding figure exists yet — it is the most informed number available.
    setApprovedBudget(
      item.approvedBudget?.toString() ?? item.recommendedBudget?.toString() ?? item.estimatedBudget?.toString() ?? "",
    );
    setBudgetNotes(item.budgetNotes ?? "");
    setRows((item.supportItems ?? []).map(toSupportRow));
    setRowsError("");
  }, [item, status]);

  if (!item) return null;

  const needsReason = REASON_REQUIRED.includes(status);
  const destructive = status === "rejected" || status === "archived";
  // Approving the payment decides the support too.
  const supportMode = status === "budget_approved" && (item.supportItems?.length ?? 0) > 0 ? "allocate" : null;

  const patchRow = (index: number, change: Partial<SupportRow>) =>
    setRows((previous) => previous.map((row, i) => (i === index ? { ...row, ...change } : row)));

  const submit = async () => {
    if (supportMode === "allocate" && rows.some((row) => row.allocatedQty === "")) {
      setRowsError(tx("allocationRequired"));
      return;
    }
    const trimmedNote = note.trim() || undefined;
    const payload: Record<string, unknown> = { status, reviewNote: trimmedNote, statusReason: trimmedNote };
    if (BUDGET_STEPS.includes(status) && approvedBudget) {
      // The server rejects a negative figure with a 400; catching it here keeps
      // the dialog open on the offending field.
      const parsed = Number(approvedBudget);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setBudgetError(t("budgetCannotBeNegative"));
        return;
      }
      payload.approvedBudget = parsed;
      payload.budgetNotes = budgetNotes;
    }
    setSaving(true);
    try {
      // The support record first: if it is refused, the request stays put.
      if (supportMode) {
        const saved = await saveSupportRows(item._id, supportMode, rows);
        if (!saved.ok) {
          setRowsError(saved.error ?? tx("allocateError"));
          return;
        }
      }
      const response = await csrfFetch(`/api/exhibitions/${item._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        toast.error(error.error ?? t("failedToUpdateRequest"));
        return;
      }
      const statusKey = STATUS_LABEL_KEYS[status];
      toast.success(t("requestMovedTo", { status: statusKey ? t(statusKey) : status }));
      onDone();
    } catch {
      toast.error(t("failedToUpdateRequest"));
    } finally {
      setSaving(false);
    }
  };

  // Warn, don't block: approving with support still short is the admin's
  // call. Read from the rows being edited, so the warning follows what is typed.
  const supportLines = (item.supportItems ?? []).map((line, index) => {
    const row = rows[index];
    return row && supportMode ? { ...line, allocatedQty: row.allocatedQty === "" ? undefined : Number(row.allocatedQty) } : line;
  }) as SupportItem[];
  const supportWarning = supportMode && getAllocationSummary(supportLines).status !== "full" ? "warningNotAllocated" : null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className={supportMode ? "flex max-h-[90vh] flex-col sm:max-w-xl" : "max-w-md"}>
        <DialogHeader>
          <DialogTitle>{t(titleKey(item.status, status))}</DialogTitle>
          <DialogDescription>
            {item.eventName}
            {item.agentId?.name ? ` · ${item.agentId.name}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className={supportMode ? "min-h-0 flex-1 space-y-4 -mx-1 overflow-y-auto px-1 py-1" : "space-y-4"}>
          {supportWarning && (
            <p role="status" className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {tx(supportWarning)}
            </p>
          )}
          {BUDGET_STEPS.includes(status) && (
            <div className="space-y-1.5">
              <Label htmlFor="exhibition-approved-budget">{t("approvedBudget", { currency: item.budgetCurrency })}</Label>
              <Input
                id="exhibition-approved-budget"
                type="number"
                min={0}
                step="any"
                value={approvedBudget}
                onChange={(event) => { setApprovedBudget(event.target.value); setBudgetError(""); }}
                aria-invalid={budgetError ? true : undefined}
              />
              {budgetError && <p className="text-xs font-medium text-destructive" role="alert">{budgetError}</p>}
              <p className="text-xs text-muted-foreground">{t("requested")}: {formatMoney(item.estimatedBudget, item.budgetCurrency)}</p>
              {typeof item.recommendedBudget === "number" && (
                <p className="text-xs text-muted-foreground">
                  {t("superAgentRecommended")}: {formatMoney(item.recommendedBudget, item.budgetCurrency)}
                </p>
              )}
            </div>
          )}
          {supportMode && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">{tx("allocateResources")}</p>
              <p className="text-xs text-muted-foreground">{tx("allocateStepHint")}</p>
              <SupportRowsEditor mode={supportMode} items={item.supportItems ?? []} rows={rows} onPatch={(index, change) => { patchRow(index, change); setRowsError(""); }} />
              {rowsError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{rowsError}</p>}
            </div>
          )}
          {needsReason || showNote ? (
            <div className="space-y-1.5">
              <Label htmlFor="exhibition-review-note">
                {needsReason ? t("reason") : <>{t("reviewNotes")} <span className="text-xs font-normal text-muted-foreground">({tx("optional")})</span></>}
              </Label>
              <Textarea
                id="exhibition-review-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={status === "revision_requested" ? t("whatNeedsToChange") : t("addAConciseAuditNote")}
                rows={3}
                autoFocus={!needsReason}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNote(true)}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline sm:min-h-0"
            >
              <MessageSquarePlus className="size-4" aria-hidden="true" />
              {tx("addNoteOptional")}
            </button>
          )}
          {destructive && (
            <div className="rounded-xl border border-red-200 bg-red-50 text-xs text-red-700 chip-pad">
              {t("thisIsADestructiveWorkflowAction")}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => void submit()}
            variant={destructive ? "destructive" : "default"}
            disabled={saving || (needsReason && !note.trim())}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {status === "budget_approved" ? t("approvePayment") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
