"use client";

/** Static FAQ accordion for the job seeker subscription page. */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, HelpCircle } from "lucide-react";

const QUESTIONS = ["faqCancel", "faqDowngrade", "faqBilling", "faqExpiry", "faqUpgrade"] as const;

export function SubscriptionFAQ() {
  const t = useTranslations("jobSeekerExtra.subscription");
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-border/60 bg-card space-y-3 panel-body">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <HelpCircle className="h-4 w-4" /> {t("faqTitle")}
      </h4>
      <div className="divide-y divide-border/40">
        {QUESTIONS.map((key) => {
          const isOpen = open === key;
          return (
            <div key={key}>
              <button
                onClick={() => setOpen(isOpen ? null : key)}
                className="w-full flex items-center justify-between gap-4 py-3 text-left"
              >
                <span className="text-sm font-medium">{t(`${key}Q`)}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <p className="pb-3 text-sm text-muted-foreground leading-relaxed">{t(`${key}A`)}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
