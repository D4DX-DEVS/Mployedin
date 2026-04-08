"use client";

import { useState, useEffect, useCallback } from "react";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Inbox, Eye, Trash2, Mail, MailOpen } from "lucide-react";

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

export default function ContactSubmissionsPage() {
  const [items, setItems] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewItem, setViewItem] = useState<ContactItem | null>(null);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      const r = await fetch(`/api/admin/cms/contact-submissions?${params}`);
      const d = await r.json();
      setItems(d.items ?? []);
      updateTotal(d.pagination?.total ?? 0);
    } catch {
      console.error("Failed to fetch contact submissions");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, statusFilter, updateTotal]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

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

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contact Inbox</h1>
        <p className="text-muted-foreground text-sm mt-1">View messages from the public contact form</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, email, subject..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); resetPage(); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unread">Unread</SelectItem>
            <SelectItem value="read">Read</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[30px]"></TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8" />
                    <p>No messages found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item._id} className={!item.isRead ? "bg-primary/5" : ""}>
                  <TableCell>
                    {item.isRead
                      ? <MailOpen className="h-4 w-4 text-muted-foreground" />
                      : <Mail className="h-4 w-4 text-primary" />
                    }
                  </TableCell>
                  <TableCell className={!item.isRead ? "font-semibold" : ""}>{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.email}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{item.subject || "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleView(item)} title="View">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(item._id)} title="Delete" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
            <DialogTitle>Contact Message</DialogTitle>
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
