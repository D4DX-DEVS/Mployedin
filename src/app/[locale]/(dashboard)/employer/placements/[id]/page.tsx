"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft, Briefcase, User, Building2, Calendar, DollarSign,
  ClipboardCheck, CheckCircle2, XCircle, StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/hooks/useConfirm";
import { formatCount, formatDate } from "@/lib/ui/intlFormat";

type PlacementLocation = string | { country?: string; city?: string; isRemote?: boolean };

interface PlacementDetail {
  _id: string;
  status?: "active" | "completed" | "terminated";
  placedAt?: string;
  startDate?: string;
  salary?: number;
  currency?: string;
  visaStatus?: string;
  commissionPaid?: boolean;
  notes?: string;
  jobId?: {
    title?: string;
    location?: PlacementLocation;
  } | null;
  jobSeekerId?: { userId?: { name?: string; email?: string } } | null;
}

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  completed: "bg-sky-100 text-sky-700 border-sky-200",
  terminated: "bg-rose-100 text-rose-700 border-rose-200",
};

function formatLocation(location?: PlacementLocation) {
  if (!location) return undefined;
  if (typeof location === "string") return location;
  if (location.isRemote) return "Remote";
  return [location.city, location.country].filter(Boolean).join(", ") || undefined;
}

export default function PlacementDetailPage() {
  const t = useTranslations("employerPlacements");
  const router = useRouter();
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const [placement, setPlacement] = useState<PlacementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/placements/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPlacement(data.placement);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function transition(status: "completed" | "terminated") {
    const ok = await confirmDialog({
      message: status === "completed" ? t("confirmComplete") : t("confirmTerminate"),
      variant: status === "terminated" ? "destructive" : "default",
    });
    if (!ok) return;
    setTransitioning(true);
    try {
      const res = await fetch(`/api/placements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error);
      }
      toast.success(t("statusUpdated"));
      await load();
    } catch (e: unknown) {
      toast.error(t("statusUpdateFailed"));
    } finally {
      setTransitioning(false);
    }
  }

  if (loading) {
    return (
      <div className="page-container">
        <div className="h-9 w-32 bg-muted animate-pulse rounded-lg" />
        <div className="card-base h-64 animate-pulse bg-muted/40 rounded-2xl" />
      </div>
    );
  }

  if (error || !placement) {
    return (
      <div className="page-container">
        <div className="card-base min-w-0 p-5 py-10 text-center sm:p-8 sm:py-16">
          <h2 className="text-lg font-semibold mb-4">{t("detailLoadError")}</h2>
          <div className="flex min-w-0 flex-col justify-center gap-3 sm:flex-row">
            <Button className="max-w-full" variant="outline" onClick={() => void load()}>{t("retry")}</Button>
            <Button className="max-w-full whitespace-normal" variant="outline" onClick={() => router.push(`/${locale}/employer/placements`)}>
              <ArrowLeft className="w-4 h-4 me-2" /> {t("backToPlacements")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const status = placement.status ?? "active";
  const candidate = placement.jobSeekerId?.userId;

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" size="sm" className="w-fit gap-1.5" onClick={() => router.push(`/${locale}/employer/placements`)}>
          <ArrowLeft className="h-4 w-4" /> {t("backToPlacements")}
        </Button>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="outline" className={STATUS_BADGE[status]}>{t(`status_${status}`)}</Badge>
          {status === "active" && (
            <>
              <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90" disabled={transitioning} onClick={() => void transition("completed")}>
                <CheckCircle2 className="h-4 w-4" /> {t("markCompleted")}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10" disabled={transitioning} onClick={() => void transition("terminated")}>
                <XCircle className="h-4 w-4" /> {t("markTerminated")}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="card-base space-y-5 panel-body">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{candidate?.name ?? t("candidate")}</h1>
          {candidate?.email && <p className="text-sm text-muted-foreground mt-0.5">{candidate.email}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoItem icon={Briefcase} label={t("jobCol")} value={placement.jobId?.title} />
          <InfoItem icon={Building2} label={t("locationLabel")} value={formatLocation(placement.jobId?.location)} />
          <InfoItem
            icon={DollarSign}
            label={t("salaryCol")}
            value={placement.salary != null ? `${placement.currency ?? "AED"} ${formatCount(placement.salary)}` : undefined}
          />
          <InfoItem
            icon={Calendar}
            label={t("placedAtLabel")}
            value={placement.placedAt ? formatDate(new Date(placement.placedAt)) : undefined}
          />
          <InfoItem
            icon={Calendar}
            label={t("startDateLabel")}
            value={placement.startDate ? formatDate(new Date(placement.startDate)) : undefined}
          />
          <InfoItem icon={User} label={t("visaStatusLabel")} value={placement.visaStatus?.replace(/_/g, " ")} />
        </div>

        {placement.notes && (
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <StickyNote className="h-3.5 w-3.5" /> {t("notesLabel")}
            </p>
            <p className="text-sm whitespace-pre-wrap">{placement.notes}</p>
          </div>
        )}
      </div>

      <Link
        href={`/${locale}/employer/placements/${id}/onboarding`}
        className="card-base flex items-center justify-between gap-3 transition-colors hover:bg-muted/40 panel-body"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <ClipboardCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">{t("onboardingLinkTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("onboardingLinkDesc")}</p>
          </div>
        </div>
        <ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground rtl:rotate-0" />
      </Link>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: typeof Briefcase; label: string; value?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium capitalize">{value ?? "—"}</p>
      </div>
    </div>
  );
}
