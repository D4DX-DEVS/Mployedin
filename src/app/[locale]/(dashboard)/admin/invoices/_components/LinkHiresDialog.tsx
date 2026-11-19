"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { csrfFetch } from "@/lib/security/csrf-client";
import { formatDate } from "@/lib/ui/intlFormat";

interface InvoiceLine {
  index: number;
  description: string;
  amount: number;
  jobId: string | null;
  placementId: string | null;
}

interface Hire {
  id: string;
  jobId: string | null;
  jobTitle: string | null;
  candidateName: string | null;
  startDate: string | null;
  status: string;
  billedElsewhere: boolean;
}

interface LinkHiresData {
  invoiceNumber: string;
  lines: InvoiceLine[];
  hires: Hire[];
}

interface LinkState {
  [lineIndex: number]: {
    placementId: string;
    reason: string;
    pending: boolean;
    error?: string;
  };
}

interface LinkHiresDialogProps {
  invoiceId: string | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function LinkHiresDialog({ invoiceId, open, onClose, onSuccess }: LinkHiresDialogProps) {
  const t = useTranslations("adminInvoices");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [data, setData] = useState<LinkHiresData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkState, setLinkState] = useState<LinkState>({});

  // Fetch data when dialog opens
  useEffect(() => {
    if (!open || !invoiceId) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/invoices/${invoiceId}/link-hire`);
        if (!res.ok) throw new Error(t("failedToLoadData"));
        const json = await res.json() as LinkHiresData;
        setData(json);
        // Initialize link state with empty selections
        const initial: LinkState = {};
        json.lines.forEach((line) => {
          if (!line.placementId) {
            initial[line.index] = { placementId: "", reason: "", pending: false };
          }
        });
        setLinkState(initial);
      } catch {
        // Never show a raw exception; the copy is always ours.
        const msg = t("failedToLoadData");
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [open, invoiceId, t]);

  const handleLink = async (lineIndex: number) => {
    const state = linkState[lineIndex];
    if (!state || !state.placementId) return;

    setLinkState((prev) => ({
      ...prev,
      [lineIndex]: { ...prev[lineIndex]!, pending: true, error: undefined },
    }));

    try {
      const res = await csrfFetch(`/api/admin/invoices/${invoiceId}/link-hire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineIndex,
          placementId: state.placementId,
          reason: state.reason || undefined,
        }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const errorMsg = typeof json.error === "string" ? json.error : "";
        let msg = t("linkHiresErrorGeneric");
        if (res.status === 409) msg = t("linkHiresErrorAlreadyLinked");
        else if (res.status === 400 && errorMsg.includes("employer")) msg = t("linkHiresErrorWrongEmployer");
        else if (res.status === 400 && errorMsg.includes("job")) msg = t("linkHiresErrorWrongJob");
        else if (res.status === 400 && errorMsg.includes("not on this invoice")) msg = t("linkHiresErrorNoLine");
        setLinkState((prev) => ({ ...prev, [lineIndex]: { ...prev[lineIndex]!, pending: false, error: msg } }));
        toast.error(msg);
        return;
      }

      toast.success(t("linkHiresSuccess"));
      setLinkState((prev) => {
        const newState = { ...prev };
        delete newState[lineIndex];
        return newState;
      });
      // Refresh parent data
      onSuccess();
    } catch {
      const msg = t("linkHiresErrorGeneric");
      setLinkState((prev) => ({
        ...prev,
        [lineIndex]: { ...prev[lineIndex]!, error: msg },
      }));
      toast.error(msg);
    }
  };

  if (!data && !loading && !error) return null;

  const unlinkedLines = data?.lines.filter((line) => !line.placementId) ?? [];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("linkHiresDialogTitle")}</DialogTitle>
          <DialogDescription>
            {data?.invoiceNumber && t("linkHiresDialogDescription", { invoiceNumber: data.invoiceNumber })}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && data && (
          <div className="space-y-6">
            {unlinkedLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("linkHiresNoUnlinkedLines")}</p>
            ) : (
              unlinkedLines.map((line) => {
                const state = linkState[line.index];
                const applicableHires = data.hires.filter(
                  (h) => !h.billedElsewhere && (!line.jobId || h.jobId === line.jobId)
                );
                const selectedHire = data.hires.find((h) => h.id === state?.placementId);

                return (
                  <div key={line.index} className="rounded-lg border border-border/60 p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium">{line.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("amount")}: {line.amount}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`hire-select-${line.index}`} className="text-xs font-medium">
                        {t("linkHiresSelectHire")}
                      </Label>
                      <SearchableSelect
                        id={`hire-select-${line.index}`}
                        options={applicableHires.map((h) => ({
                          value: h.id,
                          label: h.candidateName && h.jobTitle ? `${h.candidateName} · ${h.jobTitle}` : h.candidateName || h.jobTitle || h.id,
                        }))}
                        value={state?.placementId || ""}
                        onValueChange={(value) => {
                          setLinkState((prev) => ({
                            ...prev,
                            [line.index]: { ...prev[line.index]!, placementId: value, error: undefined },
                          }));
                        }}
                        placeholder={t("linkHiresSelectHirePlaceholder")}
                      />
                      {applicableHires.length === 0 && (
                        <p className="text-xs text-muted-foreground">{t("linkHiresNoApplicableHires")}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`reason-${line.index}`} className="text-xs font-medium">
                        {t("linkHiresReasonLabel")} {t("optional")}
                      </Label>
                      <Input
                        id={`reason-${line.index}`}
                        type="text"
                        placeholder={t("linkHiresReasonPlaceholder")}
                        value={state?.reason || ""}
                        onChange={(e) => {
                          setLinkState((prev) => ({
                            ...prev,
                            [line.index]: { ...prev[line.index]!, reason: e.target.value },
                          }));
                        }}
                        disabled={state?.pending}
                        className="text-sm"
                      />
                    </div>

                    {state?.error && (
                      <p className="text-xs text-destructive">{state.error}</p>
                    )}

                    <Button
                      onClick={() => handleLink(line.index)}
                      disabled={!state?.placementId || state.pending || applicableHires.length === 0}
                      size="sm"
                      className="w-full"
                    >
                      {state?.pending ? t("linking") : t("linkHiresButton")}
                    </Button>

                    {selectedHire && (
                      <div className="rounded bg-secondary/50 p-2 text-xs text-muted-foreground">
                        <p>{selectedHire.candidateName}</p>
                        <p>{selectedHire.jobTitle}</p>
                        {selectedHire.startDate && (
                          <p>{t("startDate")}: {formatDate(selectedHire.startDate, undefined, locale)}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={Object.values(linkState).some((s) => s.pending)}>
            {tCommon("cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
