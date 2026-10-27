"use client";

import { useCallback, useRef, useState } from "react";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  changedFields,
  type JobAssistChangeField,
  type JobAssistChanges,
  type JobAssistDraft,
} from "@/lib/ai/jobAssist";

export interface JobAssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Fields this answer changed in the form (assistant messages only). */
  changed?: JobAssistChangeField[];
  /** Puts those fields back as they were; only the latest answer keeps one. */
  undo?: () => void;
  failed?: boolean;
}

export type JobAssistantError = "gated" | "rate_limited" | "failed";

interface UseJobAssistantOptions {
  /** The job as the form holds it right now. */
  getJob: () => JobAssistDraft;
  /** Writes the changes into the form and returns how to put them back. */
  applyChanges: (changes: JobAssistChanges) => () => void;
  /** Fields this form has; anything else the assistant returns is ignored. */
  supportedFields?: readonly JobAssistChangeField[];
}

export interface JobAssistantState {
  messages: JobAssistantMessage[];
  busy: boolean;
  ask: (instruction: string) => Promise<void>;
  undo: (messageId: string) => void;
}

/**
 * Which message a refused request gets. Both 429s are not alike: a used-up
 * monthly or daily AI allowance will not clear in a minute.
 */
export async function assistErrorKind(res: Response): Promise<JobAssistantError> {
  if (res.status === 403 || res.status === 402) return "gated";
  if (res.status !== 429) return "failed";
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return body?.error === "LIMIT_EXCEEDED" || body?.error === "AI_DAILY_LIMIT_EXCEEDED" ? "gated" : "rate_limited";
}

function onlySupported(changes: JobAssistChanges, fields?: readonly JobAssistChangeField[]): JobAssistChanges {
  if (!fields) return changes;
  return Object.fromEntries(Object.entries(changes).filter(([k]) => fields.includes(k as JobAssistChangeField))) as JobAssistChanges;
}

let seq = 0;
const nextId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * One conversation per job form. The conversation lives in the form's page,
 * so the inline panel and the small-screen dialog show the same thread.
 */
export function useJobAssistant({ getJob, applyChanges, supportedFields }: UseJobAssistantOptions, errorText: (e: JobAssistantError) => string): JobAssistantState {
  const [messages, setMessages] = useState<JobAssistantMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const ask = useCallback(async (instruction: string) => {
    const text = instruction.trim();
    if (!text || busy) return;
    const history = messagesRef.current
      .filter((m) => !m.failed)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    setMessages((prev) => [...prev, { id: nextId(), role: "user", content: text }]);
    setBusy(true);
    try {
      const res = await csrfFetch("/api/ai/job-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text.slice(0, 1000), job: getJob(), history }),
      });
      if (!res.ok) {
        const kind = await assistErrorKind(res);
        setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: errorText(kind), failed: true }]);
        return;
      }
      const data = (await res.json()) as { reply: string; changes: JobAssistChanges };
      const changes = onlySupported(data.changes, supportedFields);
      const changed = changedFields(changes);
      const undo = changed.length ? applyChanges(changes) : undefined;
      setMessages((prev) => [
        // An older undo would put back values this answer has since changed.
        ...(undo ? prev.map((m) => (m.undo ? { ...m, undo: undefined } : m)) : prev),
        { id: nextId(), role: "assistant", content: data.reply || "", changed, undo },
      ]);
    } catch {
      setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: errorText("failed"), failed: true }]);
    } finally {
      setBusy(false);
    }
  }, [applyChanges, busy, errorText, getJob, supportedFields]);

  const undo = useCallback((messageId: string) => {
    const message = messagesRef.current.find((m) => m.id === messageId);
    message?.undo?.();
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, undo: undefined } : m)));
  }, []);

  return { messages, busy, ask, undo };
}
