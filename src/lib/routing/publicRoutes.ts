const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/employer-register",
  "/agent-register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/verify-oauth-2fa",
  "/confirm-email-change",
  "/maintenance",
  "/api/auth",
  "/api/contact",
  "/api/public",
  "/api/jobs",
  "/about",
  "/contact",
  "/blog",
  "/faq",
  "/privacy",
  "/cookies",
  "/terms",
  "/gdpr",
  "/companies",
  "/salary-explorer",
  "/jobs",
] as const;

function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(?:en|ar)/, "") || "/";
}

function matchesPublicRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function isPublicRoute(pathname: string): boolean {
  const stripped = stripLocale(pathname);

  if (stripped === "/") return true;

  return PUBLIC_ROUTES.some((route) => matchesPublicRoute(stripped, route));
}

export { PUBLIC_ROUTES };