"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Plus, Trash2, RefreshCw, Copy, Check, Webhook as WebhookIcon,
  AlertCircle, CheckCircle2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { csrfFetch } from "@/lib/security/csrf-client";
import { toast } from "sonner";

const EVENTS = [
  "invoice.created",
  "invoice.paid",
  "commission.created",
  "commission.approved",
  "commission.paid",
] as const;

interface WebhookItem {
  _id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  retryCount: number;
  lastTriggeredAt?: string;
  lastStatus?: number;
  createdAt?: string;
}

export default function AdminWebhooksPage() {
  const t = useTranslations("webhooks");
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    name: "",
    url: "",
    events: [] as string[],
    isActive: true,
    retryCount: 3,
  });

  const fetchWebhooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/webhooks");
      if (res.ok) {
        const data = await res.json();
        setWebhooks(data.webhooks || []);
      }
    } catch {
      toast.error("Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);

  const resetForm = () => {
    setForm({ name: "", url: "", events: [], isActive: true, retryCount: 3 });
    setEditId(null);
    setNewSecret(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (wh: WebhookItem) => {
    setForm({
      name: wh.name,
      url: wh.url,
      events: wh.events,
      isActive: wh.isActive,
      retryCount: wh.retryCount,
    });
    setEditId(wh._id);
    setNewSecret(null);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const endpoint = editId
        ? `/api/admin/webhooks/${editId}`
        : "/api/admin/webhooks";
      const method = editId ? "PATCH" : "POST";

      const res = await csrfFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        toast.error(err.error || "Save failed");
        return;
      }

      const data = await res.json();

      // Show secret on creation
      if (!editId && data.webhook?.secret) {
        setNewSecret(data.webhook.secret);
        toast.success("Webhook created! Copy the secret — it won't be shown again.");
      } else {
        toast.success(editId ? "Webhook updated" : "Webhook created");
        setDialogOpen(false);
        resetForm();
      }

      fetchWebhooks();
    } catch {
      toast.error("Failed to save webhook");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this webhook?")) return;
    try {
      const res = await csrfFetch(`/api/admin/webhooks/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Webhook deleted");
        fetchWebhooks();
      }
    } catch {
      toast.error("Delete failed");
    }
  };

  const toggleEvent = (event: string) => {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
  };

  const copySecret = () => {
    if (newSecret) {
      navigator.clipboard.writeText(newSecret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <WebhookIcon className="h-6 w-6" />
            Webhooks
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage outbound webhook integrations for your accounting system
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchWebhooks} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) resetForm(); setDialogOpen(v); }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" /> Add Webhook
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editId ? "Edit Webhook" : "New Webhook"}</DialogTitle>
              </DialogHeader>

              {/* Secret display (only on create success) */}
              {newSecret && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 mb-4">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                    <AlertCircle className="h-4 w-4 inline mr-1" />
                    Save this signing secret — it won't be shown again:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs break-all font-mono bg-white dark:bg-black/40 p-2 rounded">
                      {newSecret}
                    </code>
                    <Button variant="ghost" size="sm" onClick={copySecret}>
                      {copiedSecret ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button
                    className="mt-3 w-full"
                    size="sm"
                    onClick={() => { setDialogOpen(false); resetForm(); }}
                  >
                    Done
                  </Button>
                </div>
              )}

              {!newSecret && (
                <div className="space-y-4 mt-2">
                  <div className="space-y-1.5">
                    <Label>Name</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. QuickBooks Integration"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Endpoint URL</Label>
                    <Input
                      value={form.url}
                      onChange={(e) => setForm({ ...form, url: e.target.value })}
                      placeholder="https://your-system.com/webhook"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Events</Label>
                    <div className="flex flex-wrap gap-2">
                      {EVENTS.map((ev) => (
                        <Badge
                          key={ev}
                          variant={form.events.includes(ev) ? "default" : "outline"}
                          className="cursor-pointer select-none"
                          onClick={() => toggleEvent(ev)}
                        >
                          {ev}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Retry Count</Label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={form.retryCount}
                      onChange={(e) => setForm({ ...form, retryCount: Number(e.target.value) })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                      className="rounded"
                    />
                    <Label htmlFor="isActive">Active</Label>
                  </div>
                  <Button onClick={handleSubmit} className="w-full">
                    {editId ? "Update" : "Create"} Webhook
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Events</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Last Fired</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {webhooks.map((wh) => (
              <TableRow key={wh._id}>
                <TableCell className="font-medium">{wh.name}</TableCell>
                <TableCell className="max-w-[200px] truncate text-xs font-mono">
                  {wh.url}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {wh.events.map((ev) => (
                      <Badge key={ev} variant="secondary" className="text-[10px]">
                        {ev}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  {wh.isActive ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 inline" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground inline" />
                  )}
                </TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">
                  {wh.lastTriggeredAt
                    ? new Date(wh.lastTriggeredAt).toLocaleDateString()
                    : "—"}
                  {wh.lastStatus && (
                    <span className={`ml-1 ${wh.lastStatus < 400 ? "text-emerald-600" : "text-red-500"}`}>
                      ({wh.lastStatus})
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(wh)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(wh._id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {webhooks.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  No webhooks configured yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
