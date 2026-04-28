"use client";

import { useState } from "react";
import { Sparkles, Loader2, X } from "lucide-react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";

interface AIExplainButtonProps {
  /** The row data to explain — will be JSON-stringified into the prompt */
  rowData: Record<string, unknown>;
  /** Label shown in the panel title, e.g. "Application" or "Lead" */
  entityLabel?: string;
  /** Extra context prompt hint */
  context?: string;
}

/**
 * Inline AI "Explain" button for DataTable rows.
 * Click the sparkle → a panel slides in with a Gemini-generated explanation.
 */
export function AIExplainButton({ rowData, entityLabel = "item", context }: AIExplainButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState("");
  const locale = useLocale();
  const isRtl = locale === "ar";

  const explain = async () => {
    if (explanation) { setOpen(true); return; }
    setOpen(true);
    setLoading(true);
    try {
      const prompt = [
        context ?? `Explain this ${entityLabel} record in plain English for a recruitment professional.`,
        `Highlight anything notable — urgency, red flags, opportunities. Be concise (3-5 sentences).`,
        `Data: ${JSON.stringify(rowData, null, 2)}`,
      ].join("\n\n");

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          stream: false,
        }),
      });

      if (res.ok) {
        let text = "";
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
            setExplanation(text);
          }
        }
      } else {
        setExplanation("Unable to generate explanation at this time.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={explain}
        title={`AI explain this ${entityLabel}`}
        className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-all"
      >
        <Sparkles className="h-4 w-4" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          {/* Panel */}
          <div className={cn(
            "fixed top-1/2 -translate-y-1/2 z-50 w-[min(460px,calc(100vw-2rem))] max-h-[80vh] overflow-y-auto bg-background border border-border/70 rounded-2xl shadow-2xl p-6 space-y-3 animate-in duration-200",
            isRtl ? "left-4 slide-in-from-left-4" : "right-4 slide-in-from-right-4"
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-semibold capitalize">AI: {entityLabel} Summary</span>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <hr className="border-border/50" />
            {loading ? (
              <div className="flex items-center gap-2.5 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analysing…
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{explanation}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
