"use client";

import { useState } from "react";
import { Sparkles, Loader2, X } from "lucide-react";

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
        <div className="absolute right-0 top-8 z-50 w-80 bg-background border rounded-xl shadow-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold capitalize">AI: {entityLabel} Summary</span>
            </div>
            <button onClick={() => setOpen(false)} className="hover:text-muted-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analysing…
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap">{explanation}</p>
          )}
        </div>
      )}
    </div>
  );
}
