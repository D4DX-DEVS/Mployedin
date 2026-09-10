import type { NextRequest } from "next/server";
import type { UserRole, PermissionMode, CustomPermissions, Resource, Action } from "@/types/user";
import type { ParamSchema } from "./paramSchema";

/** Context passed to every tool executor — mirrors AuthContext from withAuth. */
export interface CopilotToolContext {
  userId: string;
  role: UserRole;
  locale: string;
  permissionMode: PermissionMode;
  customPermissions?: CustomPermissions;
  req: NextRequest;
  currentPage?: string;
  /** Job id parsed from currentPage, only when it is one of the caller's own jobs. */
  pageJobId?: string;
}

export interface CopilotToolPreview {
  summary: string;
  rows?: Array<{ name: string; score: number | null; note?: string }>;
  data?: unknown;
  /**
   * Args the dry run pinned (e.g. the job resolved from the current page).
   * Merged into the stored proposal so `execute` replays exactly what the
   * card showed, even though the execute route knows nothing about the page.
   */
  resolvedArgs?: Record<string, unknown>;
  /**
   * When set the action cannot run with these args (ambiguous job, nothing to
   * move). No proposal is created; the message goes back to the model as a
   * tool error so it can ask the user instead of showing a dead confirm card.
   */
  blocker?: string;
}

export interface CopilotToolResult {
  ok: boolean;
  /** Short machine/human summary returned to the model as the tool result. */
  message: string;
  /** Structured data the UI can render (table rows, links, etc). Optional. */
  data?: unknown;
}

export interface CopilotTool<Args = Record<string, unknown>> {
  /** Unique tool name, exposed to the model as the function name. Snake_case. */
  name: string;
  /** Shown to the model — describe when to call this tool. */
  description: string;
  /** Permission-matrix gate — the tool is invisible to users who fail canAccess(). */
  resource: Resource;
  action: Action;
  /** Extra role allowlist on top of canAccess(), for tools that are role-specific by nature. */
  roles?: UserRole[];
  /** true = mutates data. Requires the propose → confirm → execute flow (never auto-run). */
  mutates: boolean;
  parameters: ParamSchema;
  /** Human-readable one-liner for the confirmation card, e.g. "Apply to Senior React Developer". */
  summarize: (args: Args) => string;
  /** Optional read-only dry run for mutating tools, executed at proposal time so the confirmation card can show what will happen. Must never write. */
  preview?: (args: Args, ctx: CopilotToolContext) => Promise<CopilotToolPreview>;
  execute: (args: Args, ctx: CopilotToolContext) => Promise<CopilotToolResult>;
}

/** Frames streamed to the client as newline-delimited JSON. */
export type CopilotStreamFrame =
  | { type: "text"; content: string }
  | { type: "text_delta"; content: string }
  | { type: "tool_call"; tool: string; label: string }
  | { type: "tool_result"; tool: string; ok: boolean; message: string; data?: unknown }
  | { type: "proposal"; proposalId: string; tool: string; label: string; summary: string; args: Record<string, unknown>; preview?: CopilotToolPreview }
  | { type: "error"; message: string }
  | { type: "done" };
