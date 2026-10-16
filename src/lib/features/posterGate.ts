import { NextResponse } from "next/server";
import { POSTERS_ENABLED } from "@/lib/features/posterFeature";

/**
 * Wrap a poster route export so it answers 404 while posters are hidden.
 * Sits outside `withAuth`, so a hidden route costs no session lookup or DB call.
 */
export function gatePosters<A extends unknown[]>(
  handler: (...args: A) => Response | Promise<Response>,
): (...args: A) => Response | Promise<Response> {
  return (...args: A) =>
    POSTERS_ENABLED ? handler(...args) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
