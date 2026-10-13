"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Mail, MessageSquare, Phone, UserCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SuperAgentContact } from "@/lib/agents/superAgentContact";

interface SuperAgentBadgeProps {
  contact: SuperAgentContact | null;
  locale: string;
}

const rowClass =
  "flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500";

/**
 * The agent's super agent, beside their region in the dashboard header (client
 * feedback 2026-10-12: "no option to view the super agent of an agent"). The
 * pill names them; opening it gives a direct message, email and call.
 */
export function SuperAgentBadge({ contact, locale }: SuperAgentBadgeProps) {
  const t = useTranslations("agentDashboard.superAgent");
  if (!contact) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="me-2 inline-flex max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-violet-500/10 px-2 py-0.5 align-top text-[11px] font-semibold leading-4 text-violet-800 transition hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          <UserCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{t("pill", { name: contact.name })}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="px-2 pb-2 pt-1">
          <p className="text-xs font-medium text-muted-foreground">{t("title")}</p>
          <p className="truncate text-sm font-semibold text-foreground">{contact.name}</p>
        </div>
        <Link href={`/${locale}/agent/messages?newChat=${contact.userId}`} className={rowClass}>
          <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {t("message")}
        </Link>
        {contact.email ? (
          <a href={`mailto:${contact.email}`} className={rowClass}>
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{contact.email}</span>
          </a>
        ) : null}
        {contact.phone ? (
          <a href={`tel:${contact.phone}`} className={rowClass}>
            <Phone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span dir="ltr" className="truncate">{contact.phone}</span>
          </a>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
