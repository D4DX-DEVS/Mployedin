/**
 * GraphQL client — thin wrapper around graphql-request
 * used by React Query hooks throughout the dashboard.
 *
 * Reads the CSRF cookie and injects it as x-csrf-token
 * so that the middleware double-submit check passes.
 */

"use client";

import { GraphQLClient } from "graphql-request";

const CSRF_COOKIE = "csrf-token";
const CSRF_HEADER = "x-csrf-token";

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  return match?.split("=")[1] ?? "";
}

export const gqlClient = new GraphQLClient("/api/graphql", {
  headers: () => ({
    "Content-Type": "application/json",
    [CSRF_HEADER]: getCsrfToken(),
  }),
});
