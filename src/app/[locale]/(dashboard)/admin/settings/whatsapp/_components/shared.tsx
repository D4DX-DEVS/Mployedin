"use client";

import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";
import { DEFAULT_AUTOMATION_PARAMS } from "@/lib/communications/whatsapp/automationDefaults";

export const API = {
  status: "/api/admin/whatsapp/status",
  config: "/api/admin/whatsapp/config",
  templates: "/api/admin/whatsapp/templates",
  templatesSync: "/api/admin/whatsapp/templates/sync",
  logs: "/api/admin/whatsapp/logs",
  test: "/api/admin/whatsapp/test",
  schedules: "/api/admin/whatsapp/schedules",
} as const;

export type Translator = (key: string, values?: Record<string, string | number | Date>) => string;

export interface WaTemplate { _id: string; name: string; language: string; category: string; status: string; bodyText: string; bodyParamCount: number; qualityScore?: string; lastSyncedAt: string }
export interface WaStatus {
  configured: boolean; mode: "live" | "mock"; enabled: boolean;
  phone: { verifiedName?: string; displayPhoneNumber?: string; qualityRating?: string; messagingLimitTier?: string } | null;
  /** Short classified text from the server for logs and support. The page never renders it: it shows copy for `phoneErrorKind`. */
  phoneError: string | null;
  /** Present only when Meta answered with an error the server could classify (see `errorKindLabel`). */
  phoneErrorKind?: string;
  last24h: Record<"sent" | "delivered" | "read" | "failed" | "skipped" | "mock", number>;
  skipReasons: Array<{ reason: string; count: number }>;
}
export interface WaAutomation { enabled: boolean; templateName: string; params: string[] }
export interface WaConfig { enabled: boolean; dailyCapPerUser: number; automations: Record<string, WaAutomation> }
export interface WaSchedule {
  _id: string; name: string; enabled: boolean; kind: "once" | "recurring"; runAt?: string; cron?: string; timezone: string;
  template: { templateName: string; language: string; params: string[] };
  audience: { targetAll: boolean; targetRoles: string[] };
  nextRunAt?: string; lastRunAt?: string; lastRunStatus?: "success" | "error" | "partial"; lastRunSummary?: { sent: number; failed: number; skipped: number };
}
export interface WaLog {
  _id: string; to: string; kind: "template" | "text"; templateName?: string; source: string; status: string;
  /** Classified failure kind (see `errorKindLabel`). The Logs tab labels this, never `errorMessage`, which is Meta's own wording. */
  errorKind?: string;
  errorCode?: number; errorMessage?: string; skipReason?: string; sentAt: string;
}

export const AUTOMATION_ORDER = ["applicationReceived", "applicationStatus", "interviewInvite", "interviewScheduled", "interviewReminder", "offerUpdate", "commissionPaid"] as const;

/**
 * What the approved templates say about the parameter list a send must carry. An automation binds to a
 * template NAME and the language is chosen per recipient at send time, with the same parameters for every
 * language, so every approved language has to take the same number. A schedule names one (name, language),
 * so it passes the language and gets that row's count.
 * "unknown" is a name with no approved row, or a template list that could not be loaded.
 */
export type ParamRule = { kind: "unknown" } | { kind: "exact"; count: number } | { kind: "conflict" };
export type ParamProblem = { kind: "mismatch"; expected: number } | { kind: "conflict" } | null;

export function paramRule(approved: WaTemplate[] | null, name: string, language?: string): ParamRule {
  if (!approved) return { kind: "unknown" };
  const counts = Array.from(new Set(approved.filter((x) => x.name === name && (language === undefined || x.language === language)).map((x) => x.bodyParamCount)));
  if (counts.length === 0) return { kind: "unknown" };
  return counts.length === 1 ? { kind: "exact", count: counts[0] } : { kind: "conflict" };
}

export function paramProblem(rule: ParamRule, params: string[]): ParamProblem {
  if (rule.kind === "conflict") return { kind: "conflict" };
  return rule.kind === "exact" && params.length !== rule.count ? { kind: "mismatch", expected: rule.count } : null;
}

/**
 * Resize to `count`, keeping what is typed and filling new slots from `defaults`: by default the usual
 * first-name and notification-sentence tokens, which only a per-user notification can resolve.
 */
export const fitParams = (current: string[], count: number, defaults: readonly string[] = DEFAULT_AUTOMATION_PARAMS): string[] =>
  Array.from({ length: count }, (_, i) => current[i] ?? defaults[i] ?? "");

/**
 * A blank (or whitespace-only) parameter passes the count check but fails every send: the sender trims it,
 * resolves tokens to "" and Meta refuses an empty text parameter. A `{{token}}` the sender does not know also
 * resolves to "", but it is the admin's to type, so it is not judged here.
 */
export const hasBlankParam = (params: readonly string[]): boolean => params.some((p) => p.trim() === "");

/** A failed request and an unreadable body are the same thing to the page: it shows its own copy. */
export async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export function SectionCard({ title, icon: Icon, actions, children }: { title: string; icon: ComponentType<LucideProps>; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
      <div className="border-b border-border/40 flex items-center justify-between gap-2.5 panel-head">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10"><Icon className="w-3.5 h-3.5 text-primary" /></div>
          <h2 className="heading-label font-semibold tracking-tight">{title}</h2>
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function StatCard({ label, value, tone = "text-foreground" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

// Explicit branches only: a dynamic key would escape the i18n checks and crash on an unknown value.
// Covers every reason the backend writes (notificationDelivery.ts SkipReason, send.ts "invalid_phone");
// the status route also reports a missing reason as "unknown", which lands on the fallback.
export function skipReasonLabel(reason: string, t: Translator): string {
  if (reason === "disabled_by_admin") return t("reasonDisabledByAdmin");
  if (reason === "no_phone") return t("reasonNoPhone");
  if (reason === "invalid_phone") return t("reasonInvalidPhone");
  if (reason === "opted_out") return t("reasonOptedOut");
  if (reason === "not_verified") return t("reasonNotVerified");
  if (reason === "daily_cap") return t("reasonDailyCap");
  if (reason === "no_template_outside_window") return t("reasonNoTemplateOutsideWindow");
  return t("reasonUnknown");
}

/**
 * Copy for a classified Meta failure (WhatsAppErrorKind in lib/communications/whatsapp/errors.ts).
 * The server sends the kind, not wording to show: Meta's own text can carry detail an admin
 * should not see rendered, and it is English only. A kind added later lands on the fallback.
 */
export function errorKindLabel(kind: string, t: Translator): string {
  if (kind === "outside_window") return t("errorKindOutsideWindow");
  if (kind === "undeliverable") return t("errorKindUndeliverable");
  if (kind === "marketing_limit") return t("errorKindMarketingLimit");
  if (kind === "user_opted_out_marketing") return t("errorKindUserOptedOutMarketing");
  if (kind === "rate_limited") return t("errorKindRateLimited");
  if (kind === "template_error") return t("errorKindTemplateError");
  if (kind === "phone_not_registered") return t("errorKindPhoneNotRegistered");
  if (kind === "auth") return t("errorKindAuth");
  if (kind === "account_restricted") return t("errorKindAccountRestricted");
  return t("errorKindUnknown");
}

export function statusLabel(status: string, t: Translator): string {
  if (status === "sent") return t("statusSent");
  if (status === "delivered") return t("statusDelivered");
  if (status === "read") return t("statusRead");
  if (status === "failed") return t("statusFailed");
  if (status === "skipped") return t("statusSkipped");
  if (status === "mock") return t("statusMock");
  return status;
}

export function sourceLabel(source: string, t: Translator): string {
  if (source === "orchestrator") return t("sourceOrchestrator");
  if (source === "broadcast") return t("sourceBroadcast");
  if (source === "schedule") return t("sourceSchedule");
  if (source === "test") return t("sourceTest");
  if (source === "auto_reply") return t("sourceAutoReply");
  return source;
}

export function automationLabel(key: string, t: Translator): string {
  if (key === "applicationReceived") return t("autoApplicationReceived");
  if (key === "applicationStatus") return t("autoApplicationStatus");
  if (key === "interviewInvite") return t("autoInterviewInvite");
  if (key === "interviewScheduled") return t("autoInterviewScheduled");
  if (key === "interviewReminder") return t("autoInterviewReminder");
  if (key === "offerUpdate") return t("autoOfferUpdate");
  if (key === "commissionPaid") return t("autoCommissionPaid");
  return key;
}

export function runStatusLabel(status: string | undefined, t: Translator): string {
  if (status === "success") return t("runSuccess");
  if (status === "partial") return t("runPartial");
  if (status === "error") return t("runError");
  return t("never");
}

export function roleLabel(role: string, t: Translator): string {
  if (role === "admin") return t("roleAdmin");
  if (role === "super_agent") return t("roleSuperAgent");
  if (role === "agent") return t("roleAgent");
  if (role === "employer") return t("roleEmployer");
  if (role === "job_seeker") return t("roleJobSeeker");
  return role;
}

/**
 * "Not sent (not connected)" (the `mock` status) matters only while WhatsApp is not connected, or while
 * such messages are still in the last 24 hours. An unknown status (first load, or a failed one) shows it.
 */
export function showNotConnectedStatus(status: WaStatus | null): boolean {
  return !status || status.mode !== "live" || (status.last24h?.mock ?? 0) > 0;
}

/** Meta's template status codes (WhatsAppTemplate.status) in plain words; the uppercase code is never shown. */
export function templateStatusLabel(status: string, t: Translator): string {
  if (status === "APPROVED") return t("tplStatusApproved");
  if (status === "PENDING" || status === "IN_APPEAL") return t("tplStatusPending");
  if (status === "REJECTED") return t("tplStatusRejected");
  if (status === "PAUSED" || status === "DISABLED") return t("tplStatusStopped");
  if (status === "DELETED" || status === "PENDING_DELETION") return t("tplStatusDeleted");
  return t("tplStatusOther");
}

export function categoryLabel(category: string, t: Translator): string {
  if (category === "UTILITY") return t("categoryUtility");
  if (category === "MARKETING") return t("categoryMarketing");
  if (category === "AUTHENTICATION") return t("categoryAuthentication");
  return t("categoryOther");
}

/** Meta's quality colour for the number (quality_rating) or a template (quality_score). */
export function qualityLabel(rating: string, t: Translator): string {
  if (rating === "GREEN") return t("qualityHigh");
  if (rating === "YELLOW") return t("qualityMedium");
  if (rating === "RED") return t("qualityLow");
  return t("qualityUnknown");
}

/** Meta's messaging_limit_tier ("TIER_250", "TIER_1K", "TIER_UNLIMITED") as people a day; any other shape reads "Not known yet", never as Meta's code. */
export function tierLabel(tier: string, t: Translator): string {
  if (tier === "TIER_UNLIMITED") return t("tierUnlimited");
  const match = /^TIER_(\d+)(K?)$/.exec(tier);
  return match ? t("tierPeople", { count: Number(match[1]) * (match[2] ? 1000 : 1) }) : t("tierUnknown");
}

/** A template language code ("en", "en_US") named in the viewer's language; a code Intl cannot read is kept. */
export function languageLabel(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language", languageDisplay: "standard" }).of(code.replace("_", "-")) ?? code;
  } catch {
    return code;
  }
}

/**
 * A template as the admin picks it: the Latin name, then the language in the viewer's own language. The name is
 * isolated left to right so the brackets of "(الولايات المتحدة)" cannot jump around it in Arabic; the language
 * name keeps the page's direction. `nameClassName` lets a list set the name in the code font without the language.
 */
export function TemplateLabel({ name, language, locale, nameClassName }: { name: string; language: string; locale: string; nameClassName?: string }) {
  return (
    <>
      <bdi dir="ltr" className={nameClassName}>{name}</bdi> · {languageLabel(language, locale)}
    </>
  );
}

export function statusTone(status: string): string {
  if (status === "failed") return "text-destructive";
  if (status === "skipped") return "text-amber-600";
  if (status === "read" || status === "delivered") return "text-green-600";
  return "text-foreground";
}
