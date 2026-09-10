"use client";

import { CheckCircle2, XCircle, Loader2, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { TranscriptItem, ProposalStatus } from "./types";

type ProposalItem = Extract<TranscriptItem, { kind: "proposal" }>;

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ") || "—";
  return String(v);
}

function fmtKey(k: string): string {
  return k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

export function ToolProposalCard({
  item,
  onConfirm,
  onCancel,
}: {
  item: ProposalItem;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const t = useTranslations("copilot");
  const entries = Object.entries(item.args).filter(([, v]) => v !== undefined && v !== "");
  const isBusy = item.status === "confirming" || item.status === "cancelling";

  const rows = item.preview?.rows ?? [];

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 text-sm chip-pad">
      <div className="flex items-center gap-2 font-medium text-foreground">
        <StatusIcon status={item.status} />
        <span>{item.summary}</span>
      </div>

      {item.preview && item.status === "pending" && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">{item.preview.summary}</p>
          {rows.length > 0 && (
            <div className="rounded-md bg-background/60 p-2">
              <div className="space-y-1">
                {rows.slice(0, 8).map((row, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate font-medium text-foreground" title={row.name}>
                      {row.name}
                    </span>
                    <div className="flex min-w-0 items-center gap-2">
                      {row.score != null && (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {Math.round(row.score)}%
                        </span>
                      )}
                      {row.note && <span className="min-w-0 truncate text-xs text-muted-foreground" title={row.note}>{row.note}</span>}
                    </div>
                  </div>
                ))}
              </div>
              {rows.length > 8 && <p className="mt-1 text-xs text-muted-foreground">{t("previewMore", { count: rows.length - 8 })}</p>}
            </div>
          )}
        </div>
      )}

      {!item.preview && entries.length > 0 && item.status === "pending" && (
        <dl className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 rounded-md bg-background/60 p-2 text-xs sm:grid-cols-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 sm:block">
              <dt className="text-muted-foreground">{fmtKey(k)}</dt>
              <dd className="truncate font-medium text-foreground" title={fmtValue(v)}>{fmtValue(v)}</dd>
            </div>
          ))}
        </dl>
      )}

      {item.status === "pending" && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="h-7 px-3 text-xs" onClick={() => onConfirm(item.id)}>
            {t("confirm")}
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-3 text-xs" onClick={() => onCancel(item.id)}>
            {t("cancel")}
          </Button>
        </div>
      )}

      {isBusy && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {item.status === "confirming" ? t("executing") : t("cancelling")}
        </p>
      )}

      {item.status === "executed" && item.resultMessage && (
        <p className="mt-2 text-xs text-emerald-600">{item.resultMessage}</p>
      )}
      {item.status === "failed" && item.resultMessage && (
        <p className="mt-2 text-xs text-destructive">{item.resultMessage}</p>
      )}
      {item.status === "cancelled" && <p className="mt-2 text-xs text-muted-foreground">{t("actionCancelled")}</p>}
      {item.status === "expired" && <p className="mt-2 text-xs text-muted-foreground">{t("actionExpired")}</p>}
    </div>
  );
}

function StatusIcon({ status }: { status: ProposalStatus }) {
  const cls = "h-4 w-4 shrink-0";
  switch (status) {
    case "executed":
      return <CheckCircle2 className={cn(cls, "text-emerald-500")} />;
    case "failed":
      return <XCircle className={cn(cls, "text-destructive")} />;
    case "cancelled":
      return <XCircle className={cn(cls, "text-muted-foreground")} />;
    case "expired":
      return <Clock className={cn(cls, "text-muted-foreground")} />;
    case "confirming":
    case "cancelling":
      return <Loader2 className={cn(cls, "animate-spin text-primary")} />;
    default:
      return <AlertTriangle className={cn(cls, "text-amber-500")} />;
  }
}
