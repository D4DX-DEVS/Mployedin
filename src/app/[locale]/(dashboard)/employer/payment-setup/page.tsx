"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  CreditCard, Shield, CheckCircle2, AlertTriangle, Lock,
  Building2, Banknote, Zap,
} from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PaymentConfig {
  gateway: "stripe" | "tap" | "none";
  publicKey: string;
  isConnected: boolean;
}

const GATEWAYS = [
  {
    id: "stripe" as const,
    name: "Stripe",
    description: "Global payment processing with cards, wallets & bank transfers",
    icon: <CreditCard className="h-6 w-6" />,
    regions: "Global",
  },
  {
    id: "tap" as const,
    name: "Tap Payments",
    description: "MENA-focused payment gateway with local card & KNET support",
    icon: <Banknote className="h-6 w-6" />,
    regions: "GCC / MENA",
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function EmployerPaymentSetupPage() {
  const [selectedGateway, setSelectedGateway] = useState<"stripe" | "tap" | "none">("none");
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState(false);

  const handleSave = async () => {
    if (!selectedGateway || selectedGateway === "none") {
      toast.error("Please select a payment gateway");
      return;
    }
    if (!publicKey.trim()) {
      toast.error("Public/Publishable key is required");
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
          // Secret key is stored server-side only
          secretKey: secretKey.trim(),
        }),
      });

      if (res.ok) {
        toast.success("Payment gateway configured — ready for activation");
        setConnected(true);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save configuration");
      }
    } catch {
      toast.error("Failed to save payment configuration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <CreditCard className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Payment Setup</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure your payment gateway for subscription billing and premium features.
              Keys are securely encrypted and stored server-side.
            </p>
          </div>
        </div>

        {/* Status */}
        <div className="mt-5 workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-center gap-3">
            {connected ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">Gateway Configured</p>
                  <p className="text-xs text-muted-foreground">
                    Payment processing is set up. Connect it to billing when ready.
                  </p>
                </div>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">No Gateway Connected</p>
                  <p className="text-xs text-muted-foreground">
                    Select a provider below and enter your API keys to enable payments.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Gateway Selection */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        <h2 className="text-lg font-semibold text-foreground">Choose Provider</h2>
        <p className="mt-1 text-sm text-muted-foreground">Select the payment gateway for your region</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {GATEWAYS.map((gw) => (
            <button
              key={gw.id}
              onClick={() => setSelectedGateway(gw.id)}
              className={`workspace-glass-panel rounded-2xl p-5 text-left transition-all ${
                selectedGateway === gw.id
                  ? "ring-2 ring-primary bg-primary/5"
                  : "hover:bg-muted/50"
              }`}
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
        <section className="workspace-panel-surface rounded-[28px] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">API Keys</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Enter your {selectedGateway === "stripe" ? "Stripe" : "Tap"} API keys.
            These are encrypted and stored securely.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Publishable / Public Key</Label>
              <Input
                placeholder={selectedGateway === "stripe" ? "pk_live_..." : "pk_live_..."}
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Secret Key</Label>
              <Input
                type="password"
                placeholder={selectedGateway === "stripe" ? "sk_live_..." : "sk_live_..."}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                <Shield className="mr-1 inline h-3 w-3" />
                Secret key is encrypted server-side and never exposed to the browser
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              <Zap className="mr-1 h-4 w-4" />
              {saving ? "Saving..." : "Save Configuration"}
            </Button>
            <p className="text-xs text-muted-foreground">
              You can connect the gateway to billing later from subscription settings.
            </p>
          </div>
        </section>
      )}

      {/* Info Note */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">Payment Integration Roadmap</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground list-disc list-inside">
              <li>Step 1: Configure gateway keys (this page) ✓</li>
              <li>Step 2: Connect to subscription billing (coming soon)</li>
              <li>Step 3: Enable automated invoicing</li>
              <li>Step 4: Set up webhook for payment events</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
