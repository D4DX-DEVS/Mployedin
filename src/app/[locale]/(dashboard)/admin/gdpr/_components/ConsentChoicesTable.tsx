"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Eye, Search, SearchX } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { RowActions } from "@/components/shared/RowActions";
import { SortableTableHeader, TableSortControl } from "@/components/shared/TableSortControl";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounce } from "@/hooks/useDebounce";
import type { UsePaginationReturn } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { useMediaQuery, PHONE_QUERY } from "@/hooks/useMediaQuery";
import { COOKIE_CHOICE_OUTCOMES, COOKIE_CHOICE_SOURCES, type CookieChoicePeriod } from "@/lib/gdpr/cookieChoiceOutcome";
import { formatDate, formatTime } from "@/lib/ui/intlFormat";
import { ChoiceOutcomeBadge } from "./ChoiceOutcomeBadge";
import { parseChoicesPage, type CookieChoiceRow } from "./cookieChoice";
import { CookieChoiceCards } from "./ConsentPhoneCards";
import { PhoneFilterRow } from "./PhoneFilterRow";
import { PolicyVersionText } from "./PolicyVersionText";
import { useGdprLabels } from "./useGdprLabels";

// Date over time, two short lines: with eight columns a one-line date pushed the table past 1280px.
const DAY: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };
const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
/** The API refuses a longer search; the box never sends one. */
const SEARCH_MAX = 200;
const COLUMN_COUNT = 8;

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; rows: CookieChoiceRow[] };

interface ConsentChoicesTableProps {
  days: CookieChoicePeriod;
  /** True when the period is not the default: it counts as a filter, and both Clear buttons reset it. */
  periodChanged: boolean;
  onResetPeriod: () => void;
  /** Its own page and size (?choicesPage, ?choicesLimit): never Data Requests'. */
  pagination: UsePaginationReturn;
  /** A click on a choice reference: the lookup panel runs it. */
  onLookup: (reference: string) => void;
  /** View: opens the consent record dialog. */
  onView: (reference: string) => void;
}

/**
 * Signed-in users' cookie choices, one row per saved choice (GET
 * /api/admin/gdpr/consent/choices), filtered by the period the count cards
 * show. Search, outcome, source, order and page live in the URL under keys of
 * their own (choicesSearch, choicesOutcome, choicesSource, choicesOrder,
 * choicesPage, choicesLimit), so Data Requests and Other consents never share
 * them. Choices made
 * while signed out are counted by the cards and found by the lookup, never
 * listed: a receipt holds nothing that ties it to a person.
 */
export function ConsentChoicesTable({ days, periodChanged, onResetPeriod, pagination, onLookup, onView }: ConsentChoicesTableProps) {
  const t = useTranslations("adminGdpr");
  const locale = useLocale();
  const { sourceLabel, outcomeLabel, onOffLabel } = useGdprLabels();
  // Phones get purpose-built cards: the generic table cards hid the choice itself until tapped.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [search, setSearch] = useUrlFilter("choicesSearch", "", { debounceMs: 300 });
  const [outcome, setOutcome] = useUrlFilter("choicesOutcome", "all", { allow: COOKIE_CHOICE_OUTCOMES });
  const [source, setSource] = useUrlFilter("choicesSource", "all", { allow: COOKIE_CHOICE_SOURCES });
  const [orderParam, setOrder] = useUrlFilter("choicesOrder", "desc", { allow: ["asc", "desc"] });
  const order: "asc" | "desc" = orderParam === "asc" ? "asc" : "desc";
  const query = useDebounce(search.trim().slice(0, SEARCH_MAX), 300);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const abortRef = useRef<AbortController | null>(null);
  const { page, limit, updateTotal, resetPage, setPage, setLimit, total, totalPages } = pagination;

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "loading" });
    const params = new URLSearchParams({ page: String(page), pageSize: String(limit), days: String(days), order });
    if (query) params.set("search", query);
    if (outcome !== "all") params.set("outcome", outcome);
    if (source !== "all") params.set("source", source);
    try {
      const res = await fetch(`/api/admin/gdpr/consent/choices?${params}`, { signal: controller.signal });
      const data = res.ok ? parseChoicesPage(await res.json()) : null;
      if (controller.signal.aborted) return;
      if (!data) {
        setState({ status: "error" });
        return;
      }
      setState({ status: "ready", rows: data.data });
      updateTotal(data.total);
    } catch {
      if (!controller.signal.aborted) setState({ status: "error" });
    }
  }, [page, limit, days, order, query, outcome, source, updateTotal]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // A period other than the default narrows the list like any filter, so it counts as one.
  const filtersActive = search.trim() !== "" || outcome !== "all" || source !== "all" || periodChanged;
  /** The filter bar's Reset and the empty state's Clear filters: everything back, period included. */
  const clearFilters = () => {
    setSearch("");
    setOutcome("all");
    setSource("all");
    if (periodChanged) onResetPeriod();
    resetPage();
  };

  const header = (sortable: boolean) => (
    <TableHeader>
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableHead className="whitespace-normal sm:px-3">{t("userColumnHeader")}</TableHead>
        <TableHead className="whitespace-normal sm:px-3">{t("choiceReferenceColumnHeader")}</TableHead>
        <TableHead className="whitespace-normal sm:px-3">{t("choiceColumnHeader")}</TableHead>
        <TableHead className="whitespace-normal sm:px-3">{t("choiceDetailsColumnHeader")}</TableHead>
        <TableHead className="whitespace-normal sm:px-3">{t("consentSourceColumnHeader")}</TableHead>
        <TableHead className="whitespace-normal sm:px-3">{t("bannerVersionColumnHeader")}</TableHead>
        <TableHead className="whitespace-normal sm:px-3">
          {sortable ? (
            <SortableTableHeader
              label={t("recordedAtColumnHeader")}
              active
              order={order}
              onClick={() => { setOrder(order === "asc" ? "desc" : "asc"); resetPage(); }}
            />
          ) : (
            t("recordedAtColumnHeader")
          )}
        </TableHead>
        <TableHead className="whitespace-normal text-end sm:px-3">{t("actionsColumnHeader")}</TableHead>
      </TableRow>
    </TableHeader>
  );

  return (
    <>
      <InlineFilterBar
        // Phones: no box or padding around the filters (CSS, so the first paint has it too).
        className="workspace-panel-surface rounded-2xl border-b-0 max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none"
        onClear={filtersActive ? clearFilters : undefined}
        clearLabel={t("resetButton")}
        phoneRow={
          <PhoneFilterRow
            filters={[
              {
                key: "outcome",
                label: t("choiceColumnHeader"),
                value: outcome,
                options: [{ value: "all", label: t("choiceOutcomeAll") }, ...COOKIE_CHOICE_OUTCOMES.map((value) => ({ value, label: outcomeLabel(value) }))],
                onChange: (value) => { setOutcome(value); resetPage(); },
              },
              {
                key: "source",
                label: t("consentSourceColumnHeader"),
                value: source,
                options: [{ value: "all", label: t("choiceSourceAll") }, ...COOKIE_CHOICE_SOURCES.map((value) => ({ value, label: sourceLabel(value) }))],
                onChange: (value) => { setSource(value); resetPage(); },
              },
            ]}
            sort={{ field: "recordedAt", fields: [{ value: "recordedAt", label: t("recordedAtColumnHeader") }], order, onOrderChange: (next) => { setOrder(next); resetPage(); } }}
          />
        }
      >
        <InlineFilterSearch
          value={search}
          onChange={(value) => { setSearch(value); resetPage(); }}
          placeholder={t("choicesSearchPlaceholder")}
        />
        {/* `contents`: from sm up these sit in the bar exactly as before; phones use phoneRow instead. */}
        <div className="contents max-sm:hidden">
        <SearchableSelect
          options={[
            { value: "all", label: t("choiceOutcomeAll") },
            ...COOKIE_CHOICE_OUTCOMES.map((value) => ({ value, label: outcomeLabel(value) })),
          ]}
          value={outcome}
          onValueChange={(value) => { setOutcome(value); resetPage(); }}
          placeholder={t("choiceColumnHeader")}
          ariaLabel={t("choiceColumnHeader")}
          className={INLINE_FILTER_CONTROL}
        />
        <SearchableSelect
          options={[
            { value: "all", label: t("choiceSourceAll") },
            ...COOKIE_CHOICE_SOURCES.map((value) => ({ value, label: sourceLabel(value) })),
          ]}
          value={source}
          onValueChange={(value) => { setSource(value); resetPage(); }}
          placeholder={t("consentSourceColumnHeader")}
          ariaLabel={t("consentSourceColumnHeader")}
          className={INLINE_FILTER_CONTROL}
        />
        <TableSortControl
          value="recordedAt"
          onValueChange={() => undefined}
          options={[{ value: "recordedAt", label: t("recordedAtColumnHeader") }]}
          order={order}
          onOrderChange={(next) => { setOrder(next); resetPage(); }}
          compact
        />
        </div>
      </InlineFilterBar>

      {/* On a phone the cards sit straight on the page: a bordered panel around bordered cards doubled the border and the padding. */}
      <section className="workspace-panel-surface space-y-3 rounded-2xl panel-body max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none">
        <p className="text-xs text-muted-foreground">{t("choicesSignedInOnly")}</p>

        {/* Both skeletons, switched by CSS: `isPhone` is false until hydration. */}
        {state.status === "loading" && (
          <div className="space-y-3 sm:hidden" data-testid="cookie-choices-cards-skeleton" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
          </div>
        )}

        {state.status === "loading" && (
          <div className="overflow-x-auto max-sm:hidden" data-testid="cookie-choices-skeleton">
            <Table>
              {header(false)}
              <TableBody>
                {Array.from({ length: Math.min(limit, 10) }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: COLUMN_COUNT }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {state.status === "error" && (
          <ErrorState title={t("choicesErrorTitle")} retryLabel={t("cookieChoiceRetry")} onRetry={() => void load()} />
        )}

        {state.status === "ready" && state.rows.length === 0 && (
          <EmptyState
            icon={SearchX}
            title={t("choicesEmptyTitle")}
            description={t("choicesEmptyHelp")}
            action={filtersActive ? (
              <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={clearFilters}>{t("clearFiltersButton")}</Button>
            ) : undefined}
          />
        )}

        {state.status === "ready" && state.rows.length > 0 && isPhone && (
          <CookieChoiceCards rows={state.rows} onLookup={onLookup} onView={onView} />
        )}

        {state.status === "ready" && state.rows.length > 0 && !isPhone && (
          <div className="overflow-x-auto">
            <Table>
              {header(true)}
              <TableBody>
                {state.rows.map((row, index) => (
                  <TableRow key={row.receiptId ?? `${row.userId}-${row.recordedAt}-${index}`}>
                    <TableCell className="sm:px-3">
                      {/* Truncated so the eight columns fit at 1280px; the full text is the tooltip. */}
                      <div className="min-w-0 max-w-36">
                        <p className="truncate font-medium text-foreground" title={row.userName}>{row.userName}</p>
                        {/* ltr: an Arabic page would otherwise cut the start of the address. */}
                        {row.userEmail ? <p dir="ltr" className="truncate text-xs text-muted-foreground rtl:text-right" title={row.userEmail}>{row.userEmail}</p> : null}
                      </div>
                    </TableCell>
                    <TableCell className="sm:px-3">
                      {row.receiptId ? (
                        <button
                          type="button"
                          title={row.receiptId}
                          aria-label={t("consentReferenceLookupLabel", { reference: row.receiptId })}
                          onClick={() => onLookup(row.receiptId as string)}
                          className="-mx-1 inline-flex min-h-8 items-center gap-1 rounded px-1 font-mono text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          <Search className="size-3 shrink-0" aria-hidden="true" />
                          <span dir="ltr">{row.receiptId.slice(0, 8)}</span>
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("cookieChoiceNotRecorded")}</span>
                      )}
                    </TableCell>
                    <TableCell className="sm:px-3"><ChoiceOutcomeBadge outcome={row.outcome} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground sm:px-3">
                      {/* One wrapper: a phone card lays out one value per cell. */}
                      <div className="space-y-0.5 whitespace-nowrap">
                        <p>{t("choiceDetailDisplay", { value: onOffLabel(row.preferences) })}</p>
                        <p>{t("choiceDetailVideos", { value: onOffLabel(row.media) })}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground sm:px-3">{sourceLabel(row.source)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground sm:px-3">
                      {row.policyVersion ? <PolicyVersionText value={row.policyVersion} /> : t("cookieChoiceNotRecorded")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground sm:px-3">
                      <time dateTime={row.recordedAt}>
                        <span className="block">{formatDate(row.recordedAt, DAY, locale)}</span>
                        <span className="block text-xs">{formatTime(row.recordedAt, TIME, locale)}</span>
                      </time>
                    </TableCell>
                    <TableCell className="text-end sm:px-3">
                      {row.receiptId ? (
                        <RowActions
                          name={row.userName}
                          // Eight columns: the View label shows from 1536px; below, the icon with its tooltip.
                          labelsFrom="widest"
                          quick={[{ key: "view", label: t("viewButton"), icon: Eye, onSelect: () => onView(row.receiptId as string) }]}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        limit={limit}
        total={total}
        onPageChange={setPage}
        onLimitChange={setLimit}
      />
    </>
  );
}
