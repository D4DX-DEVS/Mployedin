/**
 * Meta error codes we act on. Everything else is "unknown"; only HTTP 5xx is
 * retried. Source: Cloud API error-code reference (spec §3 table).
 */
import { redactSecrets } from "./redact";

export type WhatsAppErrorKind =
  | "outside_window"
  | "undeliverable"
  | "marketing_limit"
  | "user_opted_out_marketing"
  | "rate_limited"
  | "template_error"
  | "phone_not_registered"
  | "auth"
  | "account_restricted"
  | "unknown";

const CODE_KINDS: Record<number, WhatsAppErrorKind> = {
  131047: "outside_window",
  131026: "undeliverable",
  131049: "marketing_limit",
  131050: "user_opted_out_marketing",
  130429: "rate_limited",
  131056: "rate_limited",
  80007: "rate_limited",
  132000: "template_error",
  132001: "template_error",
  132012: "template_error",
  132015: "template_error",
  132016: "template_error",
  133010: "phone_not_registered",
  190: "auth",
  368: "account_restricted",
  131031: "account_restricted",
  131042: "account_restricted",
};

export function classifyWhatsAppError(code?: number, httpStatus?: number): { kind: WhatsAppErrorKind; retryable: boolean } {
  const kind = code !== undefined ? CODE_KINDS[code] ?? "unknown" : "unknown";
  if (kind === "rate_limited") return { kind, retryable: true };
  if (kind === "unknown") return { kind, retryable: (httpStatus ?? 0) >= 500 };
  return { kind, retryable: false };
}

export class WhatsAppApiError extends Error {
  readonly code?: number;
  readonly httpStatus: number;
  readonly subcode?: number;
  readonly details?: string;
  readonly fbtraceId?: string;

  /** Message and details are scrubbed here: Graph can echo a token, and callers log both (template sync, mark-read). */
  constructor(input: { code?: number; message: string; httpStatus: number; subcode?: number; details?: string; fbtraceId?: string }) {
    super(redactSecrets(input.message));
    this.name = "WhatsAppApiError";
    this.code = input.code;
    this.httpStatus = input.httpStatus;
    this.subcode = input.subcode;
    this.details = typeof input.details === "string" ? redactSecrets(input.details) : input.details;
    this.fbtraceId = input.fbtraceId;
  }

  get kind(): WhatsAppErrorKind {
    return classifyWhatsAppError(this.code, this.httpStatus).kind;
  }

  get retryable(): boolean {
    return classifyWhatsAppError(this.code, this.httpStatus).retryable;
  }
}
