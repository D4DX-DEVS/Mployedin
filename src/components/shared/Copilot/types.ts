import type { CopilotView } from "@/lib/ai/copilot/views";

export type CopilotStreamFrame =
  | { type: "text"; content: string }
  | { type: "text_delta"; content: string }
  | { type: "tool_call"; tool: string; label: string }
  | { type: "tool_result"; tool: string; ok: boolean; message: string; data?: unknown }
  | { type: "view"; tool: string; view: CopilotView }
  | {
      type: "proposal";
      proposalId: string;
      tool: string;
      label: string;
      summary: string;
      args: Record<string, unknown>;
      preview?: { summary: string; rows?: Array<{ name: string; score: number | null; note?: string }> };
    }
  | { type: "error"; message: string }
  /** Drop the reply text streamed so far: the server is asking the model again. */
  | { type: "retract" }
  | { type: "done" };

export type ProposalStatus = "pending" | "confirming" | "executed" | "cancelling" | "cancelled" | "failed" | "expired";

export type TranscriptItem =
  | { id: string; kind: "user"; content: string }
  | { id: string; kind: "assistant_text"; content: string }
  | { id: string; kind: "tool_call"; tool: string; label: string; done?: boolean; ok?: boolean }
  | { id: string; kind: "tool_result"; tool: string; ok: boolean; message: string }
  | { id: string; kind: "view"; tool: string; view: CopilotView }
  | {
      id: string;
      kind: "proposal";
      proposalId: string;
      tool: string;
      label: string;
      summary: string;
      args: Record<string, unknown>;
      status: ProposalStatus;
      resultMessage?: string;
      preview?: { summary: string; rows?: Array<{ name: string; score: number | null; note?: string }> };
    }
  | { id: string; kind: "error"; message: string };
