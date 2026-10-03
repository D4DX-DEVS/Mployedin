"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BarChart3, CalendarClock, FileText, MessageSquare, RefreshCw, ScrollText, Send, Zap } from "lucide-react";
import { PageHero } from "@/components/shared/PageHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { API, showNotConnectedStatus, type WaStatus } from "./_components/shared";
import { OverviewTab } from "./_components/OverviewTab";
import { AutomationsTab } from "./_components/AutomationsTab";
import { TemplatesTab } from "./_components/TemplatesTab";
import { SchedulesTab } from "./_components/SchedulesTab";
import { LogsTab } from "./_components/LogsTab";
import { TestTab } from "./_components/TestTab";

type TabKey = "overview" | "automations" | "templates" | "schedules" | "logs" | "test";
const TAB_KEYS: readonly TabKey[] = ["overview", "automations", "templates", "schedules", "logs", "test"];

export default function AdminWhatsAppPage() {
  const t = useTranslations("adminWhatsApp");
  const [tabParam, setTabParam] = useUrlFilter("tab", "overview", { allow: TAB_KEYS });
  const tab = tabParam as TabKey;
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API.status);
      if (!res.ok) throw new Error("status");
      setStatus((await res.json()) as WaStatus);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    document.title = "WhatsApp · Admin · MPLOYEDIN";
    fetchStatus();
  }, [fetchStatus]);

  const TABS: { key: TabKey; label: string; icon: typeof BarChart3 }[] = [
    { key: "overview", label: t("tabOverview"), icon: BarChart3 },
    { key: "automations", label: t("tabAutomations"), icon: Zap },
    { key: "templates", label: t("tabTemplates"), icon: FileText },
    { key: "schedules", label: t("tabSchedules"), icon: CalendarClock },
    { key: "logs", label: t("tabLogs"), icon: ScrollText },
    { key: "test", label: t("tabTest"), icon: Send },
  ];

  return (
    <div className="page-container">
      <PageHero
        compact
        compactOnMobile
        icon={MessageSquare}
        title={t("pageTitle")}
        description={t("pageDescription")}
        actions={
          <>
            {status && (
              <Badge variant={status.mode === "live" ? "default" : "outline"} className="gap-1">
                {status.mode === "live" ? t("modeLive") : t("modeMock")}
              </Badge>
            )}
            <Button variant="outline" size="iconDense" onClick={fetchStatus} disabled={loading} aria-label={t("refresh")} title={t("refresh")}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </>
        }
      />

      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        <div className="scrollbar-none flex flex-nowrap gap-1 overflow-x-auto px-4 py-2">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={tab === item.key}
              onClick={() => setTabParam(item.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                tab === item.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground"
              }`}
            >
              <item.icon className="w-3.5 h-3.5" /> {item.label}
            </button>
          ))}
        </div>
      </section>

      {tab === "overview" && <OverviewTab status={status} loading={loading} />}
      {tab === "automations" && <AutomationsTab />}
      {tab === "templates" && <TemplatesTab mode={status?.mode} />}
      {tab === "schedules" && <SchedulesTab />}
      {tab === "logs" && <LogsTab showNotConnected={showNotConnectedStatus(status)} />}
      {tab === "test" && <TestTab mode={status?.mode} />}
    </div>
  );
}
