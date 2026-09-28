import type { getTranslations } from "next-intl/server";

/** The `superAgentDashboard` server translator, handed to the panels so they stay synchronous. */
export type SuperAgentTranslator = Awaited<ReturnType<typeof getTranslations>>;

/** Builds a locale-prefixed super-agent path: `href("/agents")` → `/en/super-agent/agents`. */
export type SuperAgentHref = (path: string) => string;
