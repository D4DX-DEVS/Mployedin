"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2 } from "lucide-react";
import { getAllocationSummary, getDeliverySummary, type SupportItem } from "@/lib/exhibitions/supportItems";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { csrfFetch } from "@/lib/security/csrf-client";
import { ADMIN_NEXT_STEP } from "@/lib/exhibitions/transitions";
import { STATUS_LABEL_KEYS, formatMoney, type ExhibitionRequest } from "../_lib/exhibitions";
import { SupportRowsEditor, saveSupportRows, toSupportRow, type SupportRow, type SupportDialogMode } from "./SupportManageDialog";

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
 * Confirms one workflow move with an audit note, and collects what that step
 * needs: the approved budget, the reason for a rejection or send-back (the
 * server refuses those without one), and for the two delivery steps the real
 * decisions — Assign resources records the team and what each requested item
 * gets; Mark active records where each delivery stands. Assign resources used
 * to be a status flip with an optional free-text team (client feedback
 * 2026-10-14: "resource assignment function has no meaning").
 */
export function ExhibitionActionDialog({ item, status, onClose, onDone }: ExhibitionActionDialogProps) {
  const t = useTranslations("adminExhibitions");
  const tx = useTranslations("exhibitions");
  const [note, setNote] = useState("");
  const [approvedBudget, setApprovedBudget] = useState("");
  const [budgetNotes, setBudgetNotes] = useState("");
  const [budgetError, setBudgetError] = useState("");
  const [assignedTeam, setAssignedTeam] = useState("");
  const [teamError, setTeamError] = useState("");
  const [rows, setRows] = useState<SupportRow[]>([]);
  const [rowsError, setRowsError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setNote("");
    setBudgetError("");
    // Prefer the super-agent's recommendation over the raw request when no
    // binding figure exists yet — it is the most informed number available.
    setApprovedBudget(
      item.approvedBudget?.toString() ?? item.recommendedBudget?.toString() ?? item.estimatedBudget?.toString() ?? "",
    );
    setBudgetNotes(item.budgetNotes ?? "");
    setAssignedTeam(item.assignedTeam?.join(", ") ?? "");
    setTeamError("");
    setRows((item.supportItems ?? []).map(toSupportRow));
    setRowsError("");
  }, [item, status]);

  if (!item) return null;

  const needsReason = REASON_REQUIRED.includes(status);
  const destructive = status === "rejected" || status === "archived";
  // Which support record this step writes, if any.
  const supportMode: SupportDialogMode | null =
    (item.supportItems?.length ?? 0) === 0
      ? null
      : status === "resources_assigned" && item.status === "budget_approved"
        ? "allocate"
        : status === "active" && item.status === "resources_assigned"
          ? "delivery"
          : null;
  const patchRow = (index: number, change: Partial<SupportRow>) =>
    setRows((previous) => previous.map((row, i) => (i === index ? { ...row, ...change } : row)));

  const submit = async () => {
    const team = assignedTeam.split(",").map((member) => member.trim()).filter(Boolean);
    if (status === "resources_assigned" && team.length === 0) {
      setTeamError(tx("teamRequired"));
      return;
    }
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
    if (status === "resources_assigned") payload.assignedTeam = team;
    setSaving(true);
    try {
      // The support record first: if it is refused, the request stays put.
      if (supportMode) {
        const saved = await saveSupportRows(item._id, supportMode, rows);
        if (!saved.ok) {
          setRowsError(saved.error ?? tx(supportMode === "allocate" ? "allocateError" : "deliveryError"));
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

  // Warn, don't block: moving on with support still unallocated (to
  // Delivery) or undelivered (to Active / Completed) is the admin's call.
  // Read from the rows being edited, so the warning follows what is typed.
  const supportLines = (item.supportItems ?? []).map((line, index) => {
    const row = rows[index];
    if (!row || !supportMode) return line;
    return supportMode === "allocate"
      ? { ...line, allocatedQty: row.allocatedQty === "" ? undefined : Number(row.allocatedQty) }
      : { ...line, deliveryStatus: row.deliveryStatus as SupportItem["deliveryStatus"] };
  }) as SupportItem[];
  const supportWarning =
    supportLines.length === 0
      ? null
      : status === "resources_assigned" && getAllocationSummary(supportLines).status !== "full"
        ? "warningNotAllocated"
        : (status === "active" || status === "completed") && !getDeliverySummary(supportLines).allDelivered
          ? "warningNotDelivered"
          : null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className={supportMode ? "flex max-h-[90vh] flex-col sm:max-w-xl" : "max-w-md"}>
        <DialogHeader>
          <DialogTitle>{t(titleKey(item.status, status))}</DialogTitle>
          <DialogDescription>
            {item.eventName}
            {item.agentId?.name ? ` · ${item.agentId.name}` : ""}. {t("addAnAuditNoteBeforeConfirming")}
          </DialogDescription>
        </DialogHeader>
        <div className={supportMode ? "min-h-0 flex-1 space-y-4 overflow-y-auto pe-1" : "space-y-4"}>
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
          {status === "resources_assigned" && (
            <div className="space-y-1.5">
              <Label htmlFor="exhibition-assigned-team">{t("assignedTeam")} <span className="text-destructive">*</span></Label>
              <Input
                id="exhibition-assigned-team"
                value={assignedTeam}
                onChange={(event) => { setAssignedTeam(event.target.value); setTeamError(""); }}
                placeholder={t("egJohnSarahAhmed")}
                aria-invalid={teamError ? true : undefined}
                aria-required
              />
              {teamError ? (
                <p className="text-xs font-medium text-destructive" role="alert">{teamError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{tx("teamHint")}</p>
              )}
            </div>
          )}
          {supportMode && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">{tx(supportMode === "allocate" ? "allocateResources" : "updateDelivery")}</p>
              <p className="text-xs text-muted-foreground">{tx(supportMode === "allocate" ? "allocateStepHint" : "deliveryStepHint")}</p>
              <SupportRowsEditor mode={supportMode} items={item.supportItems ?? []} rows={rows} onPatch={(index, change) => { patchRow(index, change); setRowsError(""); }} />
              {rowsError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{rowsError}</p>}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="exhibition-review-note">{needsReason ? t("reason") : t("reviewNotes")}</Label>
            <Textarea
              id="exhibition-review-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={status === "revision_requested" ? t("whatNeedsToChange") : t("addAConciseAuditNote")}
              rows={3}
            />
          </div>
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
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
