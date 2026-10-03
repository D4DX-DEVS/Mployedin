"use client";

import { useTranslations } from "next-intl";
import { Activity, ClipboardList, Phone, Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SectionCard, StatCard, errorKindLabel, qualityLabel, showNotConnectedStatus, skipReasonLabel, tierLabel, type WaStatus } from "./shared";

export function OverviewTab({ status, loading }: { status: WaStatus | null; loading: boolean }) {
  const t = useTranslations("adminWhatsApp");

  const counts = status?.last24h ?? { sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0, mock: 0 };
  const dash = loading ? "…" : "—";
  // A failed load must not read as "nothing happened": show a dash, not a zero.
  const count = (n: number) => (loading ? "…" : status ? n : "—");
  const showNotConnected = showNotConnectedStatus(status);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={t("statusTitle")} icon={Plug}>
          {/* The Connected / Not connected badge also sits in the page header, on every tab. */}
          <div className="panel-body space-y-2">
            <p className="text-sm text-muted-foreground">{t("statusDesc")}</p>
            <div className="flex flex-wrap items-center gap-2">
              {/* No status yet (first load, or the load failed): say nothing about the connection rather than a false verdict. */}
              {!status ? (
                <span className="text-sm text-muted-foreground">{dash}</span>
              ) : status.mode === "live" ? (
                <>
                  <Badge>{t("modeLive")}</Badge>
                  <Badge variant={status.enabled ? "outline" : "destructive"}>{status.enabled ? t("masterOn") : t("masterOff")}</Badge>
                </>
              ) : (
                // Sending on or paused means nothing while nothing can be sent, so only the connection is shown.
                <>
                  <Badge variant="outline">{t("modeMock")}</Badge>
                  <p className="basis-full text-sm text-muted-foreground">{t("notConnectedHelp")}</p>
                </>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t("phoneTitle")} icon={Phone}>
          <div className="panel-body space-y-2">
            <p className="text-sm text-muted-foreground">{t("phoneDesc")}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t("verifiedName")}</dt><dd className="min-w-0 break-words">{status?.phone?.verifiedName ?? dash}</dd>
              <dt className="text-muted-foreground">{t("displayPhone")}</dt><dd><bdi dir="ltr">{status?.phone?.displayPhoneNumber ?? dash}</bdi></dd>
              <dt className="text-muted-foreground">
                {t("qualityRating")}
                <span className="block text-xs">{t("qualityRatingHelp")}</span>
              </dt>
              <dd>{status?.phone?.qualityRating ? qualityLabel(status.phone.qualityRating, t) : dash}</dd>
              <dt className="text-muted-foreground">
                {t("messagingTier")}
                <span className="block text-xs">{t("messagingTierHelp")}</span>
              </dt>
              <dd>{status?.phone?.messagingLimitTier ? tierLabel(status.phone.messagingLimitTier, t) : dash}</dd>
            </dl>
            {/* The server's phoneError is for support; the admin sees copy for its kind, or a generic line when Meta did not classify it. */}
            {status?.phoneError && (
              <p className="text-xs text-destructive">
                {status.phoneErrorKind ? `${t("phoneErrorPrefix")}: ${errorKindLabel(status.phoneErrorKind, t)}` : t("phoneErrorGeneric")}
              </p>
            )}
            {status?.configured && !status.phone && !status.phoneError && <p className="text-xs text-muted-foreground">{t("phoneUnavailable")}</p>}
          </div>
        </SectionCard>
      </div>

      <SectionCard title={t("last24hTitle")} icon={Activity}>
        <div className="panel-body space-y-3">
          <p className="text-sm text-muted-foreground">{t("last24hDesc")}</p>
          <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${showNotConnected ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
            <StatCard label={t("statSent")} value={count(counts.sent)} />
            <StatCard label={t("statDelivered")} value={count(counts.delivered)} tone="text-green-600" />
            <StatCard label={t("statRead")} value={count(counts.read)} tone="text-green-600" />
            <StatCard label={t("statFailed")} value={count(counts.failed)} tone="text-destructive" />
            <StatCard label={t("statSkipped")} value={count(counts.skipped)} tone="text-amber-600" />
            {showNotConnected && <StatCard label={t("statMock")} value={count(counts.mock)} />}
          </div>
        </div>
        <div className="border-t border-border/40 panel-body">
          <h3 className="text-sm font-semibold">{t("skipReasonsTitle")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("skipReasonsDesc")}</p>
          {status && status.skipReasons.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">{t("noSkips")}</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {(status?.skipReasons ?? []).map((r) => (
                <li key={r.reason} className="flex items-center justify-between gap-3">
                  <span>{skipReasonLabel(r.reason, t)}</span>
                  <span className="font-mono text-muted-foreground">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>

      <SectionCard title={t("setupTitle")} icon={ClipboardList}>
        <div className="panel-body space-y-3">
          <p className="text-sm text-muted-foreground">{t("setupDesc")}</p>
          <ol className="list-decimal space-y-3 ps-5 text-sm">
            <li>{t("setupConnect")}</li>
            <li>{t("setupTemplates")}</li>
            <li>{t("setupTest")}</li>
          </ol>
        </div>
      </SectionCard>
    </div>
  );
}
