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
    // common: the Dialog close label (the sign-up consent dialog in EasyApply).
    "a11y", "auth", "calendar", "common", "companyReviews", "easyApply", "errorBoundary", "footer",
    "landing", "nav", "publicJobDetail", "salaryExplorer", "similarJobs", "socialShare",
    // The headings a CV PDF is printed with: a signed-in seeker can send the CV
    // they built on Mployedin from the public job page (EasyApply). Two
    // sub-trees, not the whole builder namespace.
    "cvBuilderPage.previewSections", "cvBuilderPage.proficiency",
    // The "set a password" form on the apply-success card (EasyApply): an
    // account made by an e-mail code has none.
    "formErrors", "passwordRequirements", "setPassword",
  ],
  auth: [
    "a11y", "agentRegister", "auth", "calendar", "common", "confirmEmailChange", "employerRegister",
    "forgotPasswordPage", "formErrors", "interviewResponse", "linkPassword", "mcpAuthorize", "passwordRequirements", "resetPassword",
    "teamJoin", "verifyEmail",
  ],
  onboarding: ["a11y", "common", "footer", "onboarding"],
  poster: ["posterShareView"],
} as const satisfies Record<string, readonly string[]>;

export type ClientMessageGroup = keyof typeof CLIENT_NAMESPACES;

/**
 * An entry is a namespace ("auth") or a dotted path to one sub-tree of it
 * ("cvBuilderPage.previewSections"), for a group that reads a handful of
 * strings from a large namespace.
 */
export function pickMessages(messages: AbstractIntlMessages, group: ClientMessageGroup): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {};
  for (const entry of CLIENT_NAMESPACES[group]) {
    const keys = entry.split(".");
    let source: unknown = messages;
    for (const key of keys) {
      source = source && typeof source === "object" ? (source as Record<string, unknown>)[key] : undefined;
    }
    if (source === undefined) continue;
    let target = picked as Record<string, unknown>;
    for (const key of keys.slice(0, -1)) {
      if (typeof target[key] !== "object" || target[key] === null) target[key] = {};
      target = target[key] as Record<string, unknown>;
    }
    target[keys[keys.length - 1]] = source;
  }
  return picked;
}
