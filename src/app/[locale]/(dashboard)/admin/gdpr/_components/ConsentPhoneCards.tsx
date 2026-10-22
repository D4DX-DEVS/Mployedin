"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Eye, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/ui/intlFormat";
import { ChoiceOutcomeBadge } from "./ChoiceOutcomeBadge";
import type { CookieChoiceRow } from "./cookieChoice";
import { ConsentTypeCell } from "./ConsentTypeCell";
import { PolicyVersionText } from "./PolicyVersionText";
import type { ConsentRow } from "./types";
import { useGdprLabels } from "./useGdprLabels";

/** "Oct 01, 2026, 3:48 PM": the same as the tables' date and time, on one line. */
const WHEN: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" };

const CARD = "min-w-0 rounded-xl border border-border/70 bg-card p-3 shadow-sm shadow-black/[0.04]";

/** Who, on the first line of a card: the name wraps, the address is cut with an ellipsis (left to right, so Arabic pages don't cut the start). */
function Person({ name, email }: { name: string; email?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="break-words font-medium leading-snug text-foreground">{name}</p>
      {email ? (
        <p dir="ltr" className="truncate text-xs text-muted-foreground rtl:text-right">{email}</p>
      ) : null}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <li className={CARD}>{children}</li>;
}

interface CookieChoiceCardsProps {
  rows: readonly CookieChoiceRow[];
  onLookup: (reference: string) => void;
  onView: (reference: string) => void;
}

/**
 * Cookie choices on a phone: who, what they chose (words and icon), what that
 * covers, where and when, and the two things to do with a reference. The
 * generic phone table cards showed only the name and the reference until
 * tapped, which hid the choice itself.
 */
export function CookieChoiceCards({ rows, onLookup, onView }: CookieChoiceCardsProps) {
  const t = useTranslations("adminGdpr");
  const locale = useLocale();
  const { sourceLabel, onOffLabel } = useGdprLabels();

  return (
    <ul aria-label={t("consentViewChoices")} className="space-y-3">
      {rows.map((row, index) => (
        <Card key={row.receiptId ?? `${row.userId}-${row.recordedAt}-${index}`}>
          <Person name={row.userName} email={row.userEmail} />
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <ChoiceOutcomeBadge outcome={row.outcome} />
            <time dateTime={row.recordedAt} className="text-xs text-muted-foreground">{formatDateTime(row.recordedAt, WHEN, locale)}</time>
          </div>
          <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
            <p>{t("choiceDetailDisplay", { value: onOffLabel(row.preferences) })}</p>
            <p>{t("choiceDetailVideos", { value: onOffLabel(row.media) })}</p>
            <p>
              {sourceLabel(row.source)}
              {" · "}
              {row.policyVersion ? <PolicyVersionText value={row.policyVersion} /> : t("cookieChoiceNotRecorded")}
            </p>
          </div>
          {row.receiptId ? (
            // "flex-flow", not "flex-wrap": the phone filter-chip rule shrinks any button inside a flex-wrap row to 30px.
            <div className="mt-3 flex items-center gap-2 [flex-flow:row_wrap]">
              <Button
                type="button"
                variant="outline"
                title={row.receiptId}
                aria-label={t("consentReferenceLookupLabel", { reference: row.receiptId })}
                onClick={() => onLookup(row.receiptId as string)}
                className="min-h-11 gap-1.5 rounded-xl px-3 font-mono text-xs text-primary"
              >
                <Search className="size-3.5 shrink-0" aria-hidden="true" />
                <span dir="ltr">{row.receiptId.slice(0, 8)}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                aria-label={t("viewRecordFor", { name: row.userName })}
                onClick={() => onView(row.receiptId as string)}
                className="min-h-11 gap-1.5 rounded-xl px-3"
              >
                <Eye className="size-4 shrink-0" aria-hidden="true" />
                {t("viewButton")}
              </Button>
            </div>
          ) : null}
        </Card>
      ))}
    </ul>
  );
}

/** Other consents on a phone: who, the consent and its version, yes or no (words and icon), and where and when. */
export function OtherConsentCards({ rows }: { rows: readonly ConsentRow[] }) {
  const t = useTranslations("adminGdpr");
  const locale = useLocale();
  const { consentTypeLabel, sourceLabel } = useGdprLabels();

  return (
    <ul aria-label={t("consentViewOther")} className="space-y-3">
      {rows.map((row) => (
        <Card key={row._id}>
          <Person name={row.userName} email={row.userEmail} />
          <div className="mt-2.5 text-sm">
            <ConsentTypeCell label={consentTypeLabel(row.consentType)} policyVersion={row.policyVersion} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {row.granted ? (
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm text-emerald-600"><CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" /> {t("consentYesLabel")}</span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm text-red-600"><XCircle className="size-3.5 shrink-0" aria-hidden="true" /> {t("consentNoLabel")}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {row.source ? sourceLabel(row.source) : "—"}
              {" · "}
              {formatDateTime(row.timestamp, WHEN, locale)}
            </span>
          </div>
        </Card>
      ))}
    </ul>
  );
}
