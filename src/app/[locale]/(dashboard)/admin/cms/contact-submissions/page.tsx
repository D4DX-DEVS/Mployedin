"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useConfirm } from "@/hooks/useConfirm";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/shared/UserAvatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Inbox, Eye, Trash2, Mail, MailOpen, MessageSquare, Send, CalendarDays } from "lucide-react";
import { PhoneRecordList } from "@/components/shared/PhoneRecordList";
import {
  type CmsFilterField,
  type CmsFilterValues,
  buildCmsQueryParams,
  cmsFiltersAreActive,
  getDefaultCmsFilterValues,
} from "@/components/features/admin/CmsHeroFilters";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { FilterField, PhoneFilterSheet, PhoneFiltersButton, SHEET_CONTROL } from "@/components/shared/PhoneFilterSheet";
import { TableSortControl, SortableTableHeader } from "@/components/shared/TableSortControl";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { formatCount, formatDate, formatDateTime } from "@/lib/ui/intlFormat";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface ContactItem {
  _id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  isRead: boolean;
  repliedAt?: string | null;
  replyBody?: string;
  readAt: string | null;
  ipAddress: string;
  createdAt: string;
}

export default function ContactSubmissionsPage() {
  const t = useTranslations("adminCmsContactSubmissions");
  const tCommon = useTranslations("common");
  const { can } = usePermissions();
  const [items, setItems] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(true);
  /* The "new contact enquiry" notification links here with ?status=unread.
     Seeded from `useSearchParams` rather than `window.location`: this page is a
     client component but Next still renders it on the server, where reading
     `window` gives the fallback and the client gives the real value — the
     hydration mismatch that pattern always produces. */
  const searchParams = useSearchParams();
  const [filterValues, setFilterValues] = useState<CmsFilterValues>(() => {
    const defaults = getDefaultCmsFilterValues();
    const fromUrl = searchParams.get("status");
    return fromUrl ? { ...defaults, status: fromUrl } : defaults;
  });
  const [viewItem, setViewItem] = useState<ContactItem | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  /** Same column flips it; a new text column starts A–Z, the date newest first. */
  const sortByColumn = (field: string) => {
    if (field === sortBy) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortOrder(field === "createdAt" ? "desc" : "asc"); }
    resetPage();
  };
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const statusOptions = [
    { value: "all", label: t("allMessagesOption") },
    { value: "unread", label: t("unreadOption") },
    { value: "read", label: t("readOption") },
  ];
  const sortOptions = [
    { value: "createdAt", label: t("tableHeaderDate") },
    { value: "name", label: t("tableHeaderName") },
    { value: "email", label: t("tableHeaderEmail") },
    { value: "subject", label: t("tableHeaderSubject") },
  ];
  const contactFilterFields: CmsFilterField[] = [
    { type: "search", placeholder: t("searchPlaceholder") },
    {
      type: "status",
      label: t("readStatusLabel"),
      options: statusOptions,
    },
  ];

  const hasActiveFilters = cmsFiltersAreActive(filterValues, contactFilterFields);
  const phoneFilterCount = filterValues.status !== getDefaultCmsFilterValues().status ? 1 : 0;

  const resetFilters = useCallback(() => {
    setFilterValues(getDefaultCmsFilterValues());
    resetPage();
  }, [resetPage]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildCmsQueryParams(
        filterValues,
        contactFilterFields,
        new URLSearchParams({ page: String(page), limit: String(limit), sortBy, sortOrder })
      );
      const r = await fetch(`/api/admin/cms/contact-submissions?${params}`);
      const d = await r.json();
      setItems(d.items ?? []);
      updateTotal(d.pagination?.total ?? 0);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterValues, sortBy, sortOrder, updateTotal]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleFilterChange = (next: CmsFilterValues) => {
    setFilterValues(next);
    resetPage();
  };

  /**
   * Answer the enquiry from here. The inbox could previously only be read and
   * emptied — an enquiry arrived, was marked read, and the conversation had to
   * continue in someone's personal mail client, where no record of it existed.
   */
  const handleReply = async () => {
    if (!viewItem || !replyText.trim()) return;
    setReplySending(true);
    try {
      const res = await fetch(`/api/admin/cms/contact-submissions/${viewItem._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: replyText.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("replyFailed"));
        return;
      }
      toast.success(t("replySent", { name: viewItem.name }));
      setReplyText("");
      setViewItem(null);
      fetchItems();
    } catch {
      toast.error(t("replyFailed"));
    } finally {
      setReplySending(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/cms/contact-submissions/${id}`, { method: "PATCH" });
      if (!res.ok) {
        toast.error(t("markReadFailed"));
        return;
      }
    } catch {
      toast.error(t("markReadFailed"));
      return;
    }
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog(t("deleteConfirmation"));
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/cms/contact-submissions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(t("deleteFailed"));
        return;
      }
    } catch {
      toast.error(t("deleteFailed"));
      return;
    }
    fetchItems();
  };

  const handleView = async (item: ContactItem) => {
    setViewItem(item);
    if (!item.isRead) {
      await handleMarkRead(item._id);
    }
  };

  const unreadCount = items.filter((i) => !i.isRead).length;

  const rowActionsFor = (row: ContactItem): { quick: RowAction[]; menu: RowAction[] } => {
    const quick: RowAction[] = [];
    const menu: RowAction[] = [];

    quick.push({
      key: "view",
      label: t("viewButtonTitle"),
      icon: Eye,
      onSelect: () => handleView(row),
    });

    if (can("cms", "delete")) {
      menu.push({
        key: "delete",
        label: t("deleteButtonTitle"),
        icon: Trash2,
        onSelect: () => handleDelete(row._id),
        destructive: true,
      });
    }

    return { quick, menu };
  };

  const emptyNode = (
    <div className="flex flex-col items-center gap-2">
      <div className="workspace-muted-pill mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-3xl">
        <Inbox className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {hasActiveFilters ? t("emptyStateNoMatchingLabel") : t("emptyStateNoMessagesLabel")}
      </p>
      <h2 className="heading-subsection mt-1 font-semibold tracking-tight text-foreground">
        {hasActiveFilters ? t("emptyStateNoMatchingTitle") : t("emptyStateNoContactsTitle")}
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
        {hasActiveFilters
          ? t("emptyStateNoMatchingDesc")
          : t("emptyStateNoContactsDesc")}
      </p>
      {hasActiveFilters && (
        <Button size="sm"
          onClick={resetFilters}
          variant="outline"
          className="mt-4 rounded-xl border-border bg-background/70 px-4 text-sm"
        >
          {t("clearFiltersButton")}
        </Button>
      )}
    </div>
  );

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      <DashboardPageHeader
        compact
        compactOnMobile
        title={t("contactInbox")}
        description={t("heroDescription")}
        summary={{
          label: t("totalMessages"),
          value: formatCount(total),
          note: t("acrossPages", { count: totalPages }),
        }}
        metrics={[
          { label: t("statTotal"), value: total, note: t("allSubmissions"), icon: Mail, iconClassName: "text-amber-600", iconSurfaceClassName: "bg-amber-50" },
          { label: t("statUnread"), value: unreadCount, note: t("awaitingReview"), icon: MessageSquare, iconClassName: "text-sky-600", iconSurfaceClassName: "bg-sky-50" },
          { label: t("statRead"), value: items.length - unreadCount, note: t("alreadyReviewed"), icon: MailOpen, iconClassName: "text-emerald-600", iconSurfaceClassName: "bg-emerald-50" },
        ]}
      />

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0 max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none"
        onClear={hasActiveFilters ? resetFilters : undefined}
        clearLabel={t("clearFiltersButton")}
      >
        <InlineFilterSearch
          value={filterValues.search}
          onChange={(value) => { handleFilterChange({ ...filterValues, search: value }); }}
          placeholder={t("searchPlaceholder")}
        />
        <PhoneFiltersButton activeCount={phoneFilterCount} onClick={() => setFilterSheetOpen(true)} />
        <div className="contents max-sm:hidden">
          <SearchableSelect
            id="contact-status-filter"
            className={INLINE_FILTER_CONTROL}
            options={statusOptions}
            value={filterValues.status}
            onValueChange={(value) => { handleFilterChange({ ...filterValues, status: value }); }}
            placeholder={t("readStatusLabel")}
          />
          <TableSortControl
            value={sortBy}
            onValueChange={(value) => { setSortBy(value); resetPage(); }}
            options={sortOptions}
            order={sortOrder}
            onOrderChange={(next) => { setSortOrder(next); resetPage(); }}
            compact
          />
        </div>
      </InlineFilterBar>

      <PhoneFilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        activeCount={phoneFilterCount}
        onClear={resetFilters}
      >
        <FilterField label={tCommon("sortBy")}>
          <TableSortControl
            value={sortBy}
            onValueChange={(value) => { setSortBy(value); resetPage(); }}
            options={sortOptions}
            order={sortOrder}
            onOrderChange={(next) => { setSortOrder(next); resetPage(); }}
            className="w-full [&_button]:h-11 [&>button:first-child]:min-w-0 [&>button:first-child]:flex-1 [&>button:last-child]:w-11"
          />
        </FilterField>
        <FilterField label={t("readStatusLabel")} htmlFor="contact-sheet-status">
          <SearchableSelect
            id="contact-sheet-status"
            className={SHEET_CONTROL}
            options={statusOptions}
            value={filterValues.status}
            onValueChange={(value) => { handleFilterChange({ ...filterValues, status: value }); }}
            placeholder={t("readStatusLabel")}
          />
        </FilterField>
      </PhoneFilterSheet>

      <PhoneRecordList
        className="sm:hidden"
        label={t("contactInbox")}
        loading={loading}
        empty={emptyNode}
        items={items.map((item) => ({
          key: item._id,
          leading: <UserAvatar name={item.name} email={item.email} className="h-10 w-10" colorful />,
          title: (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {item.isRead
                ? <MailOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                : <Mail className="h-3.5 w-3.5 shrink-0 text-primary" />}
              <span className={item.isRead ? "truncate font-medium" : "truncate"}>{item.name}</span>
            </span>
          ),
          subtitle: item.email,
          actions: <RowActions name={item.name} {...rowActionsFor(item)} />,
          meta: (
            <>
              <p className="truncate text-foreground">{item.subject || "—"}</p>
              <p className="flex min-w-0 items-center gap-1">
                <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{formatDate(new Date(item.createdAt), { day: "2-digit", month: "short", year: "numeric" })}</span>
              </p>
            </>
          ),
          badges: item.repliedAt ? (
            <span className="rounded-full bg-status-selected-bg px-2 py-0.5 font-medium text-status-selected">
              {t("repliedBadge")}
            </span>
          ) : undefined,
        }))}
      />

      <section className="workspace-panel-surface overflow-hidden rounded-3xl border-t-0 rounded-t-none max-sm:hidden">
        <div className="overflow-x-auto">
          <Table data-mobile-table="scroll">
            <TableHeader>
              <TableRow className="border-border/80 bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-[30px]"></TableHead>
<TableHead>
                  <SortableTableHeader label={t("tableHeaderName")} active={sortBy === "name"} order={sortOrder} onClick={() => sortByColumn("name")} />
                </TableHead>
<TableHead>
                  <SortableTableHeader label={t("tableHeaderEmail")} active={sortBy === "email"} order={sortOrder} onClick={() => sortByColumn("email")} />
                </TableHead>
<TableHead>
                  <SortableTableHeader label={t("tableHeaderSubject")} active={sortBy === "subject"} order={sortOrder} onClick={() => sortByColumn("subject")} />
                </TableHead>
<TableHead>
                  <SortableTableHeader label={t("tableHeaderDate")} active={sortBy === "createdAt"} order={sortOrder} onClick={() => sortByColumn("createdAt")} />
                </TableHead>
                <TableHead className="text-right">{t("tableHeaderActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/70 hover:bg-transparent">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 w-full animate-pulse rounded-md bg-muted" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="border-border/70 hover:bg-transparent">
                  <TableCell colSpan={6} className="px-6 py-16 text-center">
                    {emptyNode}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => {

                  return (
                    <TableRow key={item._id} className={`border-border/70 ${!item.isRead ? "bg-primary/5" : ""}`}>
                      <TableCell>
                        {item.isRead
                          ? <MailOpen className="h-4 w-4 text-muted-foreground" />
                          : <Mail className="h-4 w-4 text-primary" />
                        }
                      </TableCell>
                      <TableCell className={!item.isRead ? "font-semibold text-foreground" : "font-medium text-foreground"}>
                        <div className="flex items-center gap-2 min-w-0">
                          <UserAvatar name={item.name} email={item.email} className="h-8 w-8" colorful />
                          <span className="truncate">{item.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.email}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {item.subject || "—"}
                        {item.repliedAt && (
                          <span className="ms-2 rounded-full bg-status-selected-bg px-2 py-0.5 text-[11px] font-medium text-status-selected">
                            {t("repliedBadge")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(new Date(item.createdAt), { day: "2-digit", month: "short", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          name={item.name}
                          {...rowActionsFor(item)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        limit={limit}
        total={total}
        onPageChange={setPage}
        onLimitChange={(v) => { setLimit(v); resetPage(); }}
      />

      {/* View Dialog */}
      <Dialog open={!!viewItem} onOpenChange={(open) => { if (!open) setViewItem(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription className="sr-only">{t("dialogDescription")}</DialogDescription>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">{t("fieldName")}</p>
                  <p>{viewItem.name}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">{t("fieldEmail")}</p>
                  <p>{viewItem.email}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">{t("fieldPhone")}</p>
                  <p>{viewItem.phone || "—"}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">{t("fieldDate")}</p>
                  <p>{formatDateTime(new Date(viewItem.createdAt))}</p>
                </div>
              </div>
              <div>
                <p className="font-medium text-muted-foreground text-sm">{t("fieldSubject")}</p>
                <p className="font-medium">{viewItem.subject || "—"}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground text-sm">{t("fieldMessage")}</p>
                <div className="mt-1 rounded-lg border bg-muted/50 text-sm whitespace-pre-wrap card-pad">
                  {viewItem.message}
                </div>
              </div>
              {viewItem.repliedAt ? (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t("replySentLabel")}</p>
                  <div className="mt-1 whitespace-pre-wrap rounded-lg border border-emerald-200 bg-emerald-50/60 text-sm card-pad dark:border-emerald-900 dark:bg-emerald-950/30">
                    {viewItem.replyBody}
                  </div>
                </div>
              ) : (
                <div>
                  <label htmlFor="contact-reply" className="text-sm font-medium text-muted-foreground">
                    {t("replyLabel")}
                  </label>
                  <Textarea
                    id="contact-reply"
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    placeholder={t("replyPlaceholder", { name: viewItem.name })}
                    rows={5}
                    className="mt-1"
                    maxLength={5000}
                  />
                  <div className="mt-2 flex justify-end">
                    <Button
                      onClick={() => void handleReply()}
                      disabled={!replyText.trim() || replySending}
                      className="max-sm:min-h-11"
                    >
                      <Send className="me-1.5 h-4 w-4" />
                      {replySending ? t("replySending") : t("replyButton")}
                    </Button>
                  </div>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                {t("ipLabel")}: {viewItem.ipAddress}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
