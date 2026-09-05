"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useConfirm } from "@/hooks/useConfirm";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
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
import { Inbox, Eye, Trash2, Mail, MailOpen, MessageSquare, Send } from "lucide-react";
import CmsHeroFilters, {
  type CmsFilterField,
  type CmsFilterValues,
  buildCmsQueryParams,
  cmsFiltersAreActive,
  getDefaultCmsFilterValues,
} from "@/components/features/admin/CmsHeroFilters";
import { formatCount, formatDate, formatDateTime } from "@/lib/ui/intlFormat";

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
  const [showFilters, setShowFilters] = useState(false);
  const [viewItem, setViewItem] = useState<ContactItem | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const contactFilterFields: CmsFilterField[] = [
    { type: "search", placeholder: t("searchPlaceholder") },
    {
      type: "status",
      label: t("readStatusLabel"),
      options: [
        { value: "all", label: t("allMessagesOption") },
        { value: "unread", label: t("unreadOption") },
        { value: "read", label: t("readOption") },
      ],
    },
  ];

  const hasActiveFilters = cmsFiltersAreActive(filterValues, contactFilterFields);

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
        new URLSearchParams({ page: String(page), limit: String(limit) })
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
  }, [page, limit, filterValues, updateTotal]);

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
    await fetch(`/api/admin/cms/contact-submissions/${id}`, { method: "PATCH" });
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog(t("deleteConfirmation"));
    if (!ok) return;
    await fetch(`/api/admin/cms/contact-submissions/${id}`, { method: "DELETE" });
    fetchItems();
  };

  const handleView = async (item: ContactItem) => {
    setViewItem(item);
    if (!item.isRead) {
      await handleMarkRead(item._id);
    }
  };

  const unreadCount = items.filter((i) => !i.isRead).length;

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
      >
        <CmsHeroFilters
          fields={contactFilterFields}
          values={filterValues}
          onChange={handleFilterChange}
          onReset={resetFilters}
          hasActiveFilters={hasActiveFilters}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((v) => !v)}
          searchPlaceholder={t("searchPlaceholder")}
        />
      </DashboardPageHeader>

      <section className="workspace-panel-surface overflow-hidden rounded-3xl">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
                <TableHead className="w-[30px]"></TableHead>
                <TableHead>{t("tableHeaderName")}</TableHead>
                <TableHead>{t("tableHeaderEmail")}</TableHead>
                <TableHead>{t("tableHeaderSubject")}</TableHead>
                <TableHead>{t("tableHeaderDate")}</TableHead>
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
                    <div className="flex flex-col items-center gap-2">
                      <div className="workspace-muted-pill mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-3xl">
                        <Inbox className="h-7 w-7 text-muted-foreground" />
                      </div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {hasActiveFilters ? t("emptyStateNoMatchingLabel") : t("emptyStateNoMessagesLabel")}
                      </p>
                      <h3 className="heading-subsection mt-1 font-semibold tracking-tight text-foreground">
                        {hasActiveFilters ? t("emptyStateNoMatchingTitle") : t("emptyStateNoContactsTitle")}
                      </h3>
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
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item._id} className={`border-border/70 ${!item.isRead ? "bg-primary/5" : ""}`}>
                    <TableCell>
                      {item.isRead
                        ? <MailOpen className="h-4 w-4 text-muted-foreground" />
                        : <Mail className="h-4 w-4 text-primary" />
                      }
                    </TableCell>
                    <TableCell className={!item.isRead ? "font-semibold text-foreground" : "font-medium text-foreground"}>{item.name}</TableCell>
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
                      {formatDate(new Date(item.createdAt))}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="xs" onClick={() => handleView(item)} title={t("viewButtonTitle")}>
                          <Eye className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => handleDelete(item._id)} title={t("deleteButtonTitle")}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="border-t border-border/80 px-5 py-3">
          <PaginationControls
            page={page}
            totalPages={totalPages}
            limit={limit}
            total={total}
            onPageChange={setPage}
            onLimitChange={(v) => { setLimit(v); resetPage(); }}
          />
        </div>
      </section>

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
