"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  CalendarDays, Plus, Clock, CheckCircle2, XCircle,
  Trash2, Edit, Search, Inbox, MapPin, Building2,
} from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useTranslations } from "next-intl";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ExhibitionRequest {
  _id: string;
  agentId: { _id: string; name: string; email: string };
  eventName: string;
  description?: string;
  eventLocation?: string;
  eventStartDate: string;
  eventEndDate: string;
  participationType: string;
  participationDetails?: string;
  estimatedBudget?: number;
  budgetCurrency?: string;
  status: "pending" | "approved" | "rejected";
  reviewedBy?: { _id: string; name: string };
  reviewedAt?: string;
  reviewNote?: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400",
};

const PARTICIPATION_TYPES = [
  { value: "standy", label: "Standy" },
  { value: "stall", label: "Stall" },
  { value: "booth", label: "Booth" },
  { value: "sponsorship", label: "Sponsorship" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AgentExhibitionsPage() {
  const t = useTranslations("exhibitions");
  const tc = useTranslations("common");

  const [items, setItems] = useState<ExhibitionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    eventName: "", description: "", eventLocation: "",
    eventStartDate: "", eventEndDate: "",
    participationType: "standy", participationDetails: "",
    estimatedBudget: "", budgetCurrency: "USD",
  });

  const resetForm = () => {
    setForm({
      eventName: "", description: "", eventLocation: "",
      eventStartDate: "", eventEndDate: "",
      participationType: "standy", participationDetails: "",
      estimatedBudget: "", budgetCurrency: "USD",
    });
    setEditingId(null);
  };

  /* ─── Fetch ─── */
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/exhibitions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
      }
    } catch {
      toast.error(t("fetchError"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, t]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  /* ─── Create / Update ─── */
  const handleSubmit = async () => {
    if (!form.eventName.trim() || !form.eventStartDate || !form.eventEndDate || !form.participationType) {
      toast.error(t("requiredFields"));
      return;
    }

    try {
      const url = editingId ? `/api/exhibitions/${editingId}` : "/api/exhibitions";
      const method = editingId ? "PATCH" : "POST";
      const payload = {
        ...form,
        estimatedBudget: form.estimatedBudget ? Number(form.estimatedBudget) : undefined,
      };

      const res = await csrfFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(editingId ? t("updated") : t("created"));
        resetForm();
        setShowForm(false);
        fetchItems();
      } else {
        const err = await res.json();
        toast.error(err.error ?? t("submitError"));
      }
    } catch {
      toast.error(t("submitError"));
    }
  };

  /* ─── Delete ─── */
  const handleDelete = async (id: string) => {
    try {
      const res = await csrfFetch(`/api/exhibitions/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("deleted"));
        fetchItems();
      }
    } catch {
      toast.error(t("deleteError"));
    }
  };

  /* ─── Edit ─── */
  const startEdit = (item: ExhibitionRequest) => {
    setForm({
      eventName: item.eventName,
      description: item.description ?? "",
      eventLocation: item.eventLocation ?? "",
      eventStartDate: item.eventStartDate?.slice(0, 10) ?? "",
      eventEndDate: item.eventEndDate?.slice(0, 10) ?? "",
      participationType: item.participationType,
      participationDetails: item.participationDetails ?? "",
      estimatedBudget: item.estimatedBudget?.toString() ?? "",
      budgetCurrency: item.budgetCurrency ?? "USD",
    });
    setEditingId(item._id);
    setShowForm(true);
  };

  /* ─── Helpers ─── */
  const formatDate = (d: string) => new Date(d).toLocaleDateString();
  const dayCount = (start: string, end: string) => {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t("subtitle")}</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          {t("newRequest")}
        </Button>
      </div>

      {/* ─── Filters ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <SearchableSelect
          options={STATUS_OPTIONS}
          value={statusFilter}
          onValueChange={setStatusFilter}
          placeholder={t("filterStatus")}
        />
      </div>

      {/* ─── List ─── */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Clock className="h-5 w-5 animate-spin mr-2" /> {tc("loading")}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Inbox className="h-12 w-12 mb-3 opacity-40" />
          <p>{t("noRequests")}</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <div
              key={item._id}
              className="rounded-lg border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-lg">{item.eventName}</h3>
                    <Badge className={STATUS_COLORS[item.status]}>
                      {item.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                      {item.status === "approved" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {item.status === "rejected" && <XCircle className="h-3 w-3 mr-1" />}
                      {t(item.status)}
                    </Badge>
                    <Badge variant="outline" className="capitalize">{item.participationType}</Badge>
                  </div>

                  {item.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
                  )}

                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(item.eventStartDate)} – {formatDate(item.eventEndDate)}
                      <span className="text-xs">({dayCount(item.eventStartDate, item.eventEndDate)} {t("days")})</span>
                    </span>
                    {item.eventLocation && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {item.eventLocation}
                      </span>
                    )}
                    {item.estimatedBudget != null && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />
                        {item.budgetCurrency} {item.estimatedBudget.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {item.reviewNote && (
                    <p className="text-sm mt-2 p-2 rounded bg-muted">
                      <span className="font-medium">{t("reviewNote")}:</span> {item.reviewNote}
                    </p>
                  )}
                </div>

                {item.status === "pending" && (
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => startEdit(item)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(item._id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Create / Edit Dialog ─── */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { resetForm(); setShowForm(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? t("editRequest") : t("newRequest")}</DialogTitle>
            <DialogDescription>{t("formDescription")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="eventName">{t("eventName")} *</Label>
              <Input
                id="eventName"
                value={form.eventName}
                onChange={(e) => setForm({ ...form, eventName: e.target.value })}
                placeholder={t("eventNamePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t("description")}</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t("descriptionPlaceholder")}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="eventLocation">{t("eventLocation")}</Label>
              <Input
                id="eventLocation"
                value={form.eventLocation}
                onChange={(e) => setForm({ ...form, eventLocation: e.target.value })}
                placeholder={t("locationPlaceholder")}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="startDate">{t("startDate")} *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={form.eventStartDate}
                  onChange={(e) => setForm({ ...form, eventStartDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">{t("endDate")} *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={form.eventEndDate}
                  onChange={(e) => setForm({ ...form, eventEndDate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("participationType")} *</Label>
              <SearchableSelect
                options={PARTICIPATION_TYPES}
                value={form.participationType}
                onValueChange={(v) => setForm({ ...form, participationType: v })}
                placeholder={t("selectType")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="participationDetails">{t("participationDetails")}</Label>
              <Textarea
                id="participationDetails"
                value={form.participationDetails}
                onChange={(e) => setForm({ ...form, participationDetails: e.target.value })}
                placeholder={t("participationDetailsPlaceholder")}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="budget">{t("estimatedBudget")}</Label>
                <Input
                  id="budget"
                  type="number"
                  value={form.estimatedBudget}
                  onChange={(e) => setForm({ ...form, estimatedBudget: e.target.value })}
                  placeholder="0"
                  min="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">{t("currency")}</Label>
                <Input
                  id="currency"
                  value={form.budgetCurrency}
                  onChange={(e) => setForm({ ...form, budgetCurrency: e.target.value })}
                  placeholder="USD"
                  maxLength={5}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setShowForm(false); }}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleSubmit}>
              {editingId ? tc("save") : t("submitRequest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
