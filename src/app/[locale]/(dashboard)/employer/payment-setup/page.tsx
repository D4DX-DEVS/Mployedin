"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  CreditCard, Shield, CheckCircle2, AlertTriangle, Lock,
  Building2, Banknote, Zap,
} from "lucide-react";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { csrfFetch } from "@/lib/security/csrf-client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PaymentConfig {
  gateway: "stripe" | "tap" | "none";
  publicKey: string;
  isConnected: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function EmployerPaymentSetupPage() {
  const t = useTranslations("employerPaymentSetup");
  const [selectedGateway, setSelectedGateway] = useState<"stripe" | "tap" | "none">("none");
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState(false);

  const GATEWAYS = [
    {
      id: "stripe" as const,
      name: t("gatewayStripeName"),
      description: t("gatewayStripeDesc"),
      icon: <CreditCard className="h-6 w-6" />,
      regions: t("gatewayStripeRegions"),
    },
    {
      id: "tap" as const,
      name: t("gatewayTapName"),
      description: t("gatewayTapDesc"),
      icon: <Banknote className="h-6 w-6" />,
      regions: t("gatewayTapRegions"),
    },
  ];

  const handleSave = async () => {
    if (!selectedGateway || selectedGateway === "none") {
      toast.error(t("errorSelectGateway"));
      return;
    }
    if (!publicKey.trim()) {
      toast.error(t("errorPublicKeyRequired"));
      return;
    }

    setSaving(true);
    try {
      const res = await csrfFetch("/api/employer/payment-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateway: selectedGateway,
          publicKey: publicKey.trim(),
          secretKey: secretKey.trim(),
        }),
      });

      if (res.ok) {
        toast.success(t("successConfigured"));
        setConnected(true);
      } else {
        const data = await res.json();
        toast.error(data.error || t("errorSaveFailed"));
      }
    } catch {
      toast.error(t("errorSaveFailedGeneric"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      {/* Hero */}
      <DashboardPageHeader
        icon={CreditCard}
        title={t("title")}
        description={t("subtitle")}
        summary={{
          label: connected ? t("statusConnected") : t("statusDisconnected"),
          value: connected ? t("statusConnected") : t("statusDisconnected"),
          note: connected ? t("statusConnectedDesc") : t("statusDisconnectedDesc"),
        }}
      />

      {/* Gateway Selection */}
      <section className="workspace-panel-surface rounded-3xl panel-body">
        <h2 className="heading-section font-semibold text-foreground">{t("chooseProvider")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("chooseProviderDesc")}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {GATEWAYS.map((gw) => (
            <button
              key={gw.id}
              onClick={() => setSelectedGateway(gw.id)}
              className={`workspace-glass-panel rounded-2xl text-start transition-all ${ selectedGateway === gw.id ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/50" } panel-body`}
            >
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-muted p-2">{gw.icon}</div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{gw.name}</p>
                  <p className="text-[11px] text-muted-foreground">{gw.regions}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{gw.description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* API Key Configuration */}
      {selectedGateway !== "none" && (
        <section className="workspace-panel-surface rounded-3xl space-y-4 panel-body">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <h2 className="heading-section font-semibold text-foreground">{t("apiKeysTitle")}</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("apiKeysDesc", { gateway: selectedGateway === "stripe" ? t("gatewayStripeName") : t("gatewayTapName") })}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <Label>{t("publicKeyLabel")}</Label>
              <Input
                placeholder={selectedGateway === "stripe" ? "pk_live_..." : "pk_live_..."}
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
              />
            </div>
            <div className="field">
              <Label>{t("secretKeyLabel")}</Label>
              <Input
                type="password"
                placeholder={selectedGateway === "stripe" ? "sk_live_..." : "sk_live_..."}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                <Shield className="mr-1 inline h-3 w-3" />
                {t("secretKeyNote")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              <Zap className="mr-1 h-4 w-4" />
              {saving ? t("saving") : t("saveConfig")}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t("connectLaterNote")}
            </p>
          </div>
        </section>
      )}

      {/* Info Note */}
      <section className="workspace-panel-surface rounded-3xl panel-body">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">{t("roadmapTitle")}</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground list-disc list-inside">
              <li>{t("roadmapStep1")}</li>
              <li>{t("roadmapStep2")}</li>
              <li>{t("roadmapStep3")}</li>
              <li>{t("roadmapStep4")}</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
