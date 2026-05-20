"use client";

import { useState, useEffect, useCallback } from "react";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useConfirm } from "@/hooks/useConfirm";
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
import { Inbox, Eye, Trash2, Mail, MailOpen, Sparkles, MessageSquare } from "lucide-react";
import CmsHeroFilters, {
  type CmsFilterField,
  type CmsFilterValues,
  buildCmsQueryParams,
  cmsFiltersAreActive,
  getDefaultCmsFilterValues,
} from "@/components/features/admin/CmsHeroFilters";

interface ContactItem {
  _id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  ipAddress: string;
  createdAt: string;
}

const CONTACT_FILTER_FIELDS: CmsFilterField[] = [
  { type: "search", placeholder: "Search name, email, subject, or message…" },
  {
    type: "status",
    label: "Read status",
    options: [
      { value: "all", label: "All messages" },
      { value: "unread", label: "Unread" },
      { value: "read", label: "Read" },
    ],
  },
];

export default function ContactSubmissionsPage() {
  const [items, setItems] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterValues, setFilterValues] = useState<CmsFilterValues>(getDefaultCmsFilterValues);
  const [showFilters, setShowFilters] = useState(false);
  const [viewItem, setViewItem] = useState<ContactItem | null>(null);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const hasActiveFilters = cmsFiltersAreActive(filterValues, CONTACT_FILTER_FIELDS);

  const resetFilters = useCallback(() => {
    setFilterValues(getDefaultCmsFilterValues());
    resetPage();
  }, [resetPage]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildCmsQueryParams(
        filterValues,
        CONTACT_FILTER_FIELDS,
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

  const handleMarkRead = async (id: string) => {
    await fetch(`/api/admin/cms/contact-submissions/${id}`, { method: "PATCH" });
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog("Are you sure you want to delete this submission?");
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
    <div className="page-container space-y-6">
      {ConfirmDialogNode}

      {/* Hero Section */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
              <Sparkles className="h-3.5 w-3.5" />
              CMS Workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              Contact Inbox
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              View and manage messages from the public contact form. Keep track of inquiries and respond promptly.
            </p>
          </div>

          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total messages</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{total.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Across {totalPages} page{totalPages === 1 ? "" : "s"}</p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total</p>
                <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">{total}</p>
              </div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/30">
                <Mail className="h-5 w-5 text-amber-600" />
              </span>
            </div>
            <p className="mt-3 text-sm leading-5 text-muted-foreground">All submissions</p>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Unread</p>
                <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">{unreadCount}</p>
              </div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 dark:bg-sky-950/30">
                <MessageSquare className="h-5 w-5 text-sky-600" />
              </span>
            </div>
            <p className="mt-3 text-sm leading-5 text-muted-foreground">Awaiting review</p>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Read</p>
                <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">{items.length - unreadCount}</p>
              </div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/30">
                <MailOpen className="h-5 w-5 text-emerald-600" />
              </span>
            </div>
            <p className="mt-3 text-sm leading-5 text-muted-foreground">Already reviewed</p>
          </div>
        </div>

        <CmsHeroFilters
          fields={CONTACT_FILTER_FIELDS}
          values={filterValues}
          onChange={handleFilterChange}
          onReset={resetFilters}
          hasActiveFilters={hasActiveFilters}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((v) => !v)}
          searchPlaceholder="Search name, email, subject, or message…"
        />
      </section>

      <section className="workspace-panel-surface overflow-hidden rounded-[28px]">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
                <TableHead className="w-[30px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                      <div className="workspace-muted-pill mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-[24px]">
                        <Inbox className="h-7 w-7 text-muted-foreground" />
                      </div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {hasActiveFilters ? "No matching messages" : "No messages yet"}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
                        {hasActiveFilters ? "No messages match the current search." : "No contact messages found."}
                      </h3>
                      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                        {hasActiveFilters
                          ? "Adjust the filters or check back later."
                          : "When visitors submit the contact form, messages will appear here."}
                      </p>
                      {hasActiveFilters && (
                        <Button
                          onClick={resetFilters}
                          variant="outline"
                          className="mt-4 h-9 rounded-xl border-border bg-background/70 px-4 text-sm"
                        >
                          Clear filters
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
                    <TableCell className="max-w-[200px] truncate">{item.subject || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="xs" onClick={() => handleView(item)} title="View">
                          <Eye className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => handleDelete(item._id)} title="Delete">
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
            <DialogTitle>Contact Message</DialogTitle>
            <DialogDescription className="sr-only">View the full details of the selected contact form submission.</DialogDescription>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">Name</p>
                  <p>{viewItem.name}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Email</p>
                  <p>{viewItem.email}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Phone</p>
                  <p>{viewItem.phone || "—"}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Date</p>
                  <p>{new Date(viewItem.createdAt).toLocaleString()}</p>
                </div>
              </div>
              <div>
                <p className="font-medium text-muted-foreground text-sm">Subject</p>
                <p className="font-medium">{viewItem.subject || "—"}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground text-sm">Message</p>
                <div className="mt-1 rounded-lg border bg-muted/50 p-4 text-sm whitespace-pre-wrap">
                  {viewItem.message}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                IP: {viewItem.ipAddress}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
