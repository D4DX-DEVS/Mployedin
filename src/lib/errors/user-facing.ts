export type UserFacingErrorKind =
  | "network"
  | "permission"
  | "rate-limit"
  | "conflict"
  | "validation"
  | "unknown";

export interface UserFacingErrorCopy {
  fallback: string;
  network?: string;
  permission?: string;
  rateLimit?: string;
  conflict?: string;
  validation?: string;
}

export interface UserFacingErrorResult {
  kind: UserFacingErrorKind;
  message: string;
  retryable: boolean;
  supportCode?: string;
}

type ErrorLike = {
  code?: unknown;
  digest?: unknown;
  message?: unknown;
  name?: unknown;
  status?: unknown;
};

function asErrorLike(error: unknown): ErrorLike {
  return error && typeof error === "object" ? (error as ErrorLike) : {};
}

function normalizedErrorText(error: unknown): string {
  if (typeof error === "string") return error.toLowerCase();
  const value = asErrorLike(error);
  return [value.name, value.code, value.message]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();
}

function supportCode(error: unknown): string | undefined {
  const value = asErrorLike(error);
  const candidate = value.digest ?? value.code;
  if (typeof candidate !== "string") return undefined;
  return /^[a-z0-9_-]{4,64}$/i.test(candidate) ? candidate : undefined;
}

/**
 * Converts unknown client failures into safe, actionable copy.
 * Raw exception/API messages are intentionally never returned to the UI.
 */
export function toUserFacingError(
  error: unknown,
  copy: UserFacingErrorCopy,
): UserFacingErrorResult {
  const value = asErrorLike(error);
  const text = normalizedErrorText(error);
  const status = typeof value.status === "number" ? value.status : undefined;

  if (
    status === 401 ||
    status === 403 ||
    /forbidden|unauthorized|permission|access denied/.test(text)
  ) {
    return {
      kind: "permission",
      message: copy.permission ?? copy.fallback,
      retryable: false,
      supportCode: supportCode(error),
    };
  }

  if (status === 429 || /rate.?limit|too many requests/.test(text)) {
    return {
      kind: "rate-limit",
      message: copy.rateLimit ?? copy.fallback,
      retryable: true,
      supportCode: supportCode(error),
    };
  }

  if (status === 409 || /conflict|stale|already (?:exists|changed)/.test(text)) {
    return {
      kind: "conflict",
      message: copy.conflict ?? copy.fallback,
      retryable: false,
      supportCode: supportCode(error),
    };
  }

  if (status === 400 || status === 422 || /validation|invalid input/.test(text)) {
    return {
      kind: "validation",
      message: copy.validation ?? copy.fallback,
      retryable: false,
      supportCode: supportCode(error),
    };
  }

  if (
    value.name === "TypeError" ||
    /network|offline|failed to fetch|load failed|connection|timeout|timed out/.test(text)
  ) {
    return {
      kind: "network",
      message: copy.network ?? copy.fallback,
      retryable: true,
      supportCode: supportCode(error),
    };
  }

  return {
    kind: "unknown",
    message: copy.fallback,
    retryable: true,
    supportCode: supportCode(error),
  };
}

