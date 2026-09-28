import type { getTranslations } from "next-intl/server";

/** The `agentDashboard` server translator, passed down so panels stay synchronous. */
export type AgentTranslator = Awaited<ReturnType<typeof getTranslations>>;
