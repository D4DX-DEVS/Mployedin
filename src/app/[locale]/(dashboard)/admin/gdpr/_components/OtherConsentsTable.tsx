"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, UserCheck, XCircle } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { SortableTableHeader, TableSortControl } from "@/components/shared/TableSortControl";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounce } from "@/hooks/useDebounce";
import type { UsePaginationReturn } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { useMediaQuery, PHONE_QUERY } from "@/hooks/useMediaQuery";
import { formatDateTime } from "@/lib/ui/intlFormat";
import { ConsentTypeCell } from "./ConsentTypeCell";
import { OtherConsentCards } from "./ConsentPhoneCards";
import { PhoneFilterRow } from "./PhoneFilterRow";
import type { ConsentRow } from "./types";
import { useGdprLabels } from "./useGdprLabels";

/**
 * The consents that are not cookie choices. Mirrors CONSENT_TYPES in
 * lib/gdpr/consent.ts (a server module): "cookies" is the older single row
 * that sign-up writes (and the removed /api/user/consent POST once did), not a banner choice.
 */
const OTHER_CONSENT_TYPES = ["terms_and_privacy", "cookies", "marketing"] as const;
const COLUMN_COUNT = 5;
/** Same date format as the Cookie choices table. */
const WHEN: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" };

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; rows: ConsentRow[] };

const isConsentRows = (value: unknown): value is ConsentRow[] =>
  Array.isArray(value) && value.every((row) => typeof row === "object" && row !== null && typeof (row as ConsentRow)._id === "string");

interface OtherConsentsTableProps {
  /** Its own page and size (?otherPage, ?otherLimit): never Data Requests' or the Cookie choices view's. */
  pagination: UsePaginationReturn;
}

/**
 * "Other consents": one row per stored consent entry that is not a cookie
 * choice: Terms & Privacy acceptances, marketing e-mails and the sign-up cookie
 * row, with the consent-type filter. Cookie choices are the other view. Its
 * search, type and order live in the URL under keys of its own (otherSearch,
 * otherType, otherOrder), so nothing carries over between the views.
 */
export function OtherConsentsTable({ pagination }: OtherConsentsTableProps) {
  const t = useTranslations("adminGdpr");
  const locale = useLocale();
  const { consentTypeLabel, sourceLabel } = useGdprLabels();
  // Phones get purpose-built cards: the generic table cards hid the answer, source and time until tapped.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [search, setSearch] = useUrlFilter("otherSearch", "", { debounceMs: 300 });
  const [type, setType] = useUrlFilter("otherType", "all", { allow: OTHER_CONSENT_TYPES });
  const [orderParam, setOrder] = useUrlFilter("otherOrder", "desc", { allow: ["asc", "desc"] });
  const order: "asc" | "desc" = orderParam === "asc" ? "asc" : "desc";
  const query = useDebounce(search.trim(), 300);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const abortRef = useRef<AbortController | null>(null);
  const { page, limit, updateTotal, resetPage, setPage, setLimit, total, totalPages } = pagination;

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "loading" });
    const params = new URLSearchParams({ page: String(page), limit: String(limit), type: type === "all" ? "other" : type, sortOrder: order });
    if (query) params.set("search", query);
    try {
      const res = await fetch(`/api/admin/gdpr/consent?${params}`, { signal: controller.signal });
      const data = res.ok ? ((await res.json()) as { items?: unknown; total?: unknown }) : null;
      if (controller.signal.aborted) return;
      if (!data || !isConsentRows(data.items)) {
        setState({ status: "error" });
        return;
      }
      setState({ status: "ready", rows: data.items });
      updateTotal(typeof data.total === "number" ? data.total : 0);
    } catch {
      if (!controller.signal.aborted) setState({ status: "error" });
    }
  }, [page, limit, type, order, query, updateTotal]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const filtersActive = search.trim() !== "" || type !== "all";
  const clearFilters = () => {
    setSearch("");
    setType("all");
    resetPage();
  };
  const toggleOrder = () => {
    setOrder(order === "asc" ? "desc" : "asc");
    resetPage();
  };

  const header = (sortable: boolean) => (
    <TableHeader>
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableHead>{t("consentUserColumnHeader")}</TableHead>
        <TableHead>{t("consentTypeColumnHeader")}</TableHead>
        <TableHead>{t("grantedColumnHeader")}</TableHead>
        <TableHead>{t("consentSourceColumnHeader")}</TableHead>
        <TableHead>
          {sortable
            ? <SortableTableHeader label={t("timestampColumnHeader")} active order={order} onClick={toggleOrder} />
            : t("timestampColumnHeader")}
        </TableHead>
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
                key: "type",
                label: t("phoneFilterType"),
                value: type,
                options: [{ value: "all", label: t("allConsentTypesLabel") }, ...OTHER_CONSENT_TYPES.map((value) => ({ value, label: consentTypeLabel(value) }))],
                onChange: (value) => { setType(value); resetPage(); },
              },
            ]}
            sort={{ field: "createdAt", fields: [{ value: "createdAt", label: t("timestampColumnHeader") }], order, onOrderChange: (next) => { setOrder(next); resetPage(); } }}
          />
        }
      >
        <InlineFilterSearch value={search} onChange={(value) => { setSearch(value); resetPage(); }} placeholder={t("searchPlaceholder")} />
        {/* `contents`: from sm up these sit in the bar exactly as before; phones use phoneRow instead. */}
        <div className="contents max-sm:hidden">
        <SearchableSelect
          options={[
            { value: "all", label: t("allConsentTypesLabel") },
            ...OTHER_CONSENT_TYPES.map((value) => ({ value, label: consentTypeLabel(value) })),
          ]}
          value={type}
          onValueChange={(value) => { setType(value); resetPage(); }}
          placeholder={t("consentTypeColumnHeader")}
          className={INLINE_FILTER_CONTROL}
        />
        <TableSortControl
          value="createdAt"
          onValueChange={() => undefined}
          options={[{ value: "createdAt", label: t("timestampColumnHeader") }]}
          order={order}
          onOrderChange={(next) => { setOrder(next); resetPage(); }}
          compact
        />
        </div>
      </InlineFilterBar>

      {/* On a phone the cards sit straight on the page: a bordered panel around bordered cards doubled the border and the padding. */}
      <section className="workspace-panel-surface rounded-2xl panel-body max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none">
        {/* Both skeletons, switched by CSS: `isPhone` is false until hydration. */}
        {state.status === "loading" && (
          <div className="space-y-3 sm:hidden" data-testid="other-consents-cards-skeleton" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
          </div>
        )}

        {state.status === "loading" && (
          <div className="overflow-x-auto max-sm:hidden" data-testid="other-consents-skeleton">
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
          <ErrorState title={t("failedLoadConsentLogs")} retryLabel={t("cookieChoiceRetry")} onRetry={() => void load()} />
        )}

        {state.status === "ready" && state.rows.length === 0 && (
          <EmptyState
            icon={UserCheck}
            title={t("noConsentLogsMessage")}
            action={filtersActive ? (
              <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={clearFilters}>{t("clearFiltersButton")}</Button>
            ) : undefined}
          />
        )}

        {state.status === "ready" && state.rows.length > 0 && isPhone && <OtherConsentCards rows={state.rows} />}

        {state.status === "ready" && state.rows.length > 0 && !isPhone && (
          <div className="overflow-x-auto">
            <Table>
              {header(true)}
              <TableBody>
                {state.rows.map((row) => (
                  <TableRow key={row._id}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{row.userName}</p>
                        {row.userEmail ? <p className="break-all text-xs text-muted-foreground">{row.userEmail}</p> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ConsentTypeCell label={consentTypeLabel(row.consentType)} policyVersion={row.policyVersion} />
                    </TableCell>
                    <TableCell>
                      {row.granted ? (
                        <span className="inline-flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> {t("consentYesLabel")}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-red-600"><XCircle className="h-3.5 w-3.5" aria-hidden="true" /> {t("consentNoLabel")}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.source ? sourceLabel(row.source) : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(row.timestamp, WHEN, locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <PaginationControls page={page} totalPages={totalPages} limit={limit} total={total} onPageChange={setPage} onLimitChange={setLimit} />
    </>
  );
}
