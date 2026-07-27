export type CopilotStreamFrame =
  | { type: "text"; content: string }
  | { type: "text_delta"; content: string }
  | { type: "tool_call"; tool: string; label: string }
  | { type: "tool_result"; tool: string; ok: boolean; message: string; data?: unknown }
  | { type: "proposal"; proposalId: string; tool: string; label: string; summary: string; args: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "done" };

export type ProposalStatus = "pending" | "confirming" | "executed" | "cancelling" | "cancelled" | "failed" | "expired";

export type TranscriptItem =
  | { id: string; kind: "user"; content: string }
  | { id: string; kind: "assistant_text"; content: string }
  | { id: string; kind: "tool_call"; tool: string; label: string; done?: boolean; ok?: boolean }
  | { id: string; kind: "tool_result"; tool: string; ok: boolean; message: string }
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
    }
  | { id: string; kind: "error"; message: string };
