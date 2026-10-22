"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Cookie, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import {
  COOKIE_CHOICE_PERIODS,
  DEFAULT_COOKIE_CHOICE_PERIOD,
  isCookieChoicePeriod,
  type CookieChoicePeriod,
} from "@/lib/gdpr/cookieChoiceOutcome";
import { ConsentChoicesTable } from "./ConsentChoicesTable";
import { ConsentRecordDialog } from "./ConsentRecordDialog";
import { ConsentStatCards } from "./ConsentStatCards";
import { CookieChoicePanel } from "./CookieChoicePanel";
import type { CookieChoiceLookupRequest } from "./cookieChoice";
import { OtherConsentsTable } from "./OtherConsentsTable";
import { TermsVersionCard } from "./TermsVersionCard";

const PERIOD_VALUES = COOKIE_CHOICE_PERIODS.map(String);
const VIEWS = ["choices", "other"] as const;
type ConsentView = (typeof VIEWS)[number];
const isConsentView = (value: string): value is ConsentView => (VIEWS as readonly string[]).includes(value);

/** The page's own gap between sections (.page-container), kept inside the tabs. */
const SECTION_GAP = { gap: "var(--page-gap)" };

/**
 * Admin > GDPR > Consent Logs: the cookie-choice cards and their period, the
 * Terms card, "Find a consent record", and the records themselves in two
 * views (tabs): Cookie choices (one row per saved choice) or Other consents
 * (Terms, marketing, the sign-up cookie row). The period, the view and every
 * filter live in the URL; each table pages under its own keys, so neither
 * shares a page number with Data Requests or with the other view.
 */
export function ConsentLogsTab() {
  const t = useTranslations("adminGdpr");
  const [periodParam, setPeriod] = useUrlFilter("period", String(DEFAULT_COOKIE_CHOICE_PERIOD), { allow: PERIOD_VALUES });
  const parsedPeriod = Number(periodParam);
  const days: CookieChoicePeriod = isCookieChoicePeriod(parsedPeriod) ? parsedPeriod : DEFAULT_COOKIE_CHOICE_PERIOD;
  const [viewParam, setView] = useUrlFilter("consentView", "choices", { allow: VIEWS });
  const view: ConsentView = isConsentView(viewParam) ? viewParam : "choices";
  const choicesPagination = usePagination(undefined, { pageKey: "choicesPage", limitKey: "choicesLimit" });
  const otherPagination = usePagination(undefined, { pageKey: "otherPage", limitKey: "otherLimit" });
  const { resetPage: resetChoicesPage } = choicesPagination;
  // A click on a choice reference; the lookup panel runs it.
  const [lookupRequest, setLookupRequest] = useState<CookieChoiceLookupRequest | null>(null);
  // The record in the dialog. Kept after closing so the dialog keeps its content while it animates out.
  const [recordRef, setRecordRef] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);

  const lookup = (reference: string) => setLookupRequest((prev) => ({ reference, nonce: (prev?.nonce ?? 0) + 1 }));
  const openRecord = (reference: string) => {
    setRecordRef(reference);
    setRecordOpen(true);
  };
  const changePeriod = (next: CookieChoicePeriod) => {
    setPeriod(String(next));
    resetChoicesPage();
  };
  const changeView = (next: string) => {
    if (isConsentView(next) && next !== view) setView(next);
  };

  return (
    <>
      <ConsentRecordDialog receiptId={recordRef} open={recordOpen} onClose={() => setRecordOpen(false)} />
      <ConsentStatCards days={days} onDaysChange={changePeriod} />
      <TermsVersionCard />
      <CookieChoicePanel request={lookupRequest} onViewRecord={openRecord} />

      {/* Radix tabs: arrow keys move between the views, in the page's direction (Tabs reads it from the locale). */}
      <Tabs value={view} onValueChange={changeView} className="flex min-w-0 flex-col" style={SECTION_GAP}>
        <TabsList aria-label={t("consentViewLabel")} className="rounded-t-2xl">
          <TabsTrigger value="choices" className="max-sm:flex-1">
            <Cookie className="size-4" aria-hidden="true" />
            {t("consentViewChoices")}
          </TabsTrigger>
          <TabsTrigger value="other" className="max-sm:flex-1">
            <FileText className="size-4" aria-hidden="true" />
            {t("consentViewOther")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="choices" className="mt-0 flex min-w-0 flex-col" style={SECTION_GAP}>
          <ConsentChoicesTable
            days={days}
            periodChanged={days !== DEFAULT_COOKIE_CHOICE_PERIOD}
            onResetPeriod={() => changePeriod(DEFAULT_COOKIE_CHOICE_PERIOD)}
            pagination={choicesPagination}
            onLookup={lookup}
            onView={openRecord}
          />
        </TabsContent>
        <TabsContent value="other" className="mt-0 flex min-w-0 flex-col" style={SECTION_GAP}>
          <OtherConsentsTable pagination={otherPagination} />
        </TabsContent>
      </Tabs>
    </>
  );
}
