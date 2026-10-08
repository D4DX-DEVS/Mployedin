import { NextResponse } from "next/server";

/** A client-facing error from the insights layer. Route handlers turn it into `{ error, code }`. */
export class InsightsError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "InsightsError";
  }
}

export function insightsErrorResponse(
  status: number,
  code: string,
  error: string,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    { error, code },
    { status, headers: { "Cache-Control": "no-store", ...(headers ?? {}) } },
  );
}

export function badRequest(code: string, message: string): InsightsError {
  return new InsightsError(400, code, message);
}
