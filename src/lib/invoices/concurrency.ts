import mongoose from "mongoose";
import { NextResponse } from "next/server";

/**
 * Lost-update guard for the paths that record money against an invoice.
 *
 * Mongoose only version-checks a save() for positional array edits. A plain
 * `invoice.payments.push()` bumps `__v` but does not put it in the update
 * filter, so two requests that loaded the same invoice both pass the
 * overpayment check and both persist — 2 × 600 against a 1000 invoice, with a
 * stale paidAmount. Calling `invoice.increment()` before that save() makes the
 * write conditional on `__v`; the request that loses gets a VersionError.
 */
export function isStaleInvoiceWrite(err: unknown): boolean {
  return err instanceof mongoose.Error.VersionError;
}

export function staleInvoiceResponse() {
  return NextResponse.json(
    { error: "This invoice was modified by another request. Reload it and try again." },
    { status: 409 },
  );
}
