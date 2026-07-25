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
  execute: (args: Args, ctx: CopilotToolContext) => Promise<CopilotToolResult>;
}

/** Frames streamed to the client as newline-delimited JSON. */
export type CopilotStreamFrame =
  | { type: "text"; content: string }
  | { type: "tool_call"; tool: string; label: string }
  | { type: "tool_result"; tool: string; ok: boolean; message: string; data?: unknown }
  | { type: "proposal"; proposalId: string; tool: string; label: string; summary: string; args: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "done" };
