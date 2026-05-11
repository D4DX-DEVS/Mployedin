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
  CalendarDays, Clock, CheckCircle2, XCircle, Search, Inbox,
  MapPin, Building2, ThumbsUp, ThumbsDown, Trash2,
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

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400",
};

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export default function AdminExhibitionsPage() {
  const t = useTranslations("exhibitions");
  const tc = useTranslations("common");

  const [items, setItems] = useState<ExhibitionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [reviewItem, setReviewItem] = useState<ExhibitionRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved");
  const [reviewNote, setReviewNote] = useState("");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);
      params.set("limit", "50");

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

  const openReview = (item: ExhibitionRequest, action: "approved" | "rejected") => {
    setReviewItem(item);
    setReviewAction(action);
    setReviewNote("");
  };

  const handleReview = async () => {
    if (!reviewItem) return;
    try {
      const res = await csrfFetch(`/api/exhibitions/${reviewItem._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: reviewAction, reviewNote }),
      });
      if (res.ok) {
        toast.success(reviewAction === "approved" ? t("approvedSuccess") : t("rejectedSuccess"));
        setReviewItem(null);
        fetchItems();
      } else {
        const err = await res.json();
        toast.error(err.error ?? t("reviewError"));
      }
    } catch {
      toast.error(t("reviewError"));
    }
  };

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

  const formatDate = (d: string) => new Date(d).toLocaleDateString();
  const dayCount = (start: string, end: string) => {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CalendarDays className="h-6 w-6" />
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{t("saSubtitle")}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <SearchableSelect options={STATUS_OPTIONS} value={statusFilter} onValueChange={setStatusFilter} placeholder={t("filterStatus")} />
      </div>

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
            <div key={item._id} className="rounded-lg border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
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
                  <p className="text-sm text-primary font-medium">
                    {t("submittedBy")}: {item.agentId?.name} ({item.agentId?.email})
                  </p>
                  {item.description && <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>}
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(item.eventStartDate)} – {formatDate(item.eventEndDate)}
                      <span className="text-xs">({dayCount(item.eventStartDate, item.eventEndDate)} {t("days")})</span>
                    </span>
                    {item.eventLocation && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {item.eventLocation}</span>}
                    {item.estimatedBudget != null && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {item.budgetCurrency} {item.estimatedBudget.toLocaleString()}</span>}
                  </div>
                  {item.reviewNote && (
                    <p className="text-sm mt-2 p-2 rounded bg-muted">
                      <span className="font-medium">{t("reviewNote")}:</span> {item.reviewNote}
                      {item.reviewedBy && <span className="text-xs ml-2">— {item.reviewedBy.name}</span>}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {item.status === "pending" && (
                    <>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => openReview(item, "approved")}>
                        <ThumbsUp className="h-3.5 w-3.5 mr-1" /> {t("approve")}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => openReview(item, "rejected")}>
                        <ThumbsDown className="h-3.5 w-3.5 mr-1" /> {t("reject")}
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" onClick={() => handleDelete(item._id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!reviewItem} onOpenChange={(open) => { if (!open) setReviewItem(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{reviewAction === "approved" ? t("approveTitle") : t("rejectTitle")}</DialogTitle>
            <DialogDescription>{reviewItem?.eventName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="reviewNote">{t("reviewNoteLabel")}</Label>
              <Textarea id="reviewNote" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder={t("reviewNotePlaceholder")} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewItem(null)}>{tc("cancel")}</Button>
            <Button onClick={handleReview} variant={reviewAction === "approved" ? "default" : "destructive"} className={reviewAction === "approved" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
              {reviewAction === "approved" ? t("confirmApprove") : t("confirmReject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
