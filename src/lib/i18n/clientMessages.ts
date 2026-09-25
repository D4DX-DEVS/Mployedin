import type { AbstractIntlMessages } from "next-intl";

/**
 * The message namespaces each route group's client components read.
 *
 * A NextIntlClientProvider serialises every message it is handed into the page.
 * Handing it the whole catalogue made the public home page ~790 KB of HTML,
 * ~760 KB of it translations nobody on that page reads (audit 2026-09-24,
 * PERF-01). Each group now gets only what its components ask for; the dashboard
 * keeps the full set.
 *
 * clientMessageNamespaces.test.ts walks each group's import graph and fails when
 * a component starts using a namespace that is missing here — a missing one
 * would break every string under it.
 */
export const CLIENT_NAMESPACES = {
  /** Rendered by the [locale] root layout itself, outside every group. */
  root: ["pwaInstallPrompt"],
  public: [
    "auth", "calendar", "companyReviews", "easyApply", "errorBoundary", "footer",
    "landing", "nav", "publicJobDetail", "salaryExplorer", "similarJobs", "socialShare",
  ],
  auth: [
    "agentRegister", "auth", "calendar", "common", "confirmEmailChange", "employerRegister",
    "forgotPasswordPage", "formErrors", "interviewResponse", "mcpAuthorize", "resetPassword",
    "teamJoin", "verifyEmail",
  ],
  onboarding: ["common", "footer", "onboarding"],
  poster: ["posterShareView"],
} as const satisfies Record<string, readonly string[]>;

export type ClientMessageGroup = keyof typeof CLIENT_NAMESPACES;

export function pickMessages(messages: AbstractIntlMessages, group: ClientMessageGroup): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {};
  for (const ns of CLIENT_NAMESPACES[group]) {
    if (ns in messages) picked[ns] = messages[ns];
  }
  return picked;
}
