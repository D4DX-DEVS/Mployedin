"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { ShieldCheck, ShieldOff, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Phase = "loading" | "disabled" | "setup" | "recovery" | "enabled";

async function post2fa(body: Record<string, unknown>) {
  const res = await fetch("/api/user/2fa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Request failed");
  return data;
}

/**
 * Two-factor authentication enrollment card for admin / super_agent settings.
 * Flow: setup (QR + manual key) → verify code → show recovery codes once → enabled.
 */
export function TwoFactorCard() {
  const t = useTranslations("twoFactorCard");
  const [phase, setPhase] = useState<Phase>("loading");
  const [enabledAt, setEnabledAt] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDisable, setShowDisable] = useState(false);

  useEffect(() => {
    fetch("/api/user/2fa")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.enabled) {
          setEnabledAt(data.enabledAt ?? null);
          setPhase("enabled");
        } else {
          setPhase("disabled");
        }
      })
      .catch(() => setPhase("disabled"));
  }, []);

  const startSetup = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      const data = await post2fa({ action: "setup" });
      setQrDataUrl(data.qrDataUrl);
      setManualKey(data.manualKey);
      setCode("");
      setPhase("setup");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const verifyCode = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      const data = await post2fa({ action: "verify", code });
      setRecoveryCodes(data.recoveryCodes ?? []);
      setPhase("recovery");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }, [code]);

  const disable = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      await post2fa({ action: "disable", code, password });
      setCode("");
      setPassword("");
      setShowDisable(false);
      setPhase("disabled");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disable failed");
    } finally {
      setBusy(false);
    }
  }, [code, password]);

  const copyRecoveryCodes = useCallback(() => {
    navigator.clipboard.writeText(recoveryCodes.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [recoveryCodes]);

  return (
    <section className="card-base rounded-[28px] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("security")}</div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{t("twoFactorAuthentication")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Protect this account with a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password).
          </p>
        </div>
        {phase === "enabled" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-600">
            <ShieldCheck className="h-3.5 w-3.5" /> {t("enabled")}
          </span>
        ) : phase !== "loading" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
            <ShieldOff className="h-3.5 w-3.5" /> {t("off")}
          </span>
        ) : null}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
          <p className="text-sm font-medium text-destructive">{error}</p>
        </div>
      )}

      {phase === "loading" && (
        <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}
        </div>
      )}

      {phase === "disabled" && (
        <Button className="mt-5" onClick={startSetup} disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("setupTwoFactor")}
        </Button>
      )}

      {phase === "setup" && (
        <div className="mt-5 grid gap-6 sm:grid-cols-[auto_1fr]">
          <div className="rounded-2xl border border-border/70 bg-white p-3 w-fit">
            {qrDataUrl && (
              <Image src={qrDataUrl} alt="2FA QR code" width={200} height={200} unoptimized />
            )}
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">
                {t("scanQrCode")}
              </p>
              <code className="mt-2 block w-fit rounded-lg bg-muted px-3 py-1.5 font-mono text-xs tracking-wider break-all">
                {manualKey}
              </code>
            </div>
            <div className="space-y-2">
              <Label htmlFor="totp-verify">{t("enterCode")}</Label>
              <div className="flex gap-2">
                <Input
                  id="totp-verify"
                  inputMode="numeric"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="h-11 w-40 text-center tracking-[0.3em]"
                />
                <Button onClick={verifyCode} disabled={busy || code.trim().length < 6}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("verifyEnable")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === "recovery" && (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              Save these recovery codes now — they will not be shown again.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Each code can be used once to sign in if you lose access to your authenticator app.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {recoveryCodes.map((rc) => (
              <code key={rc} className="rounded-lg bg-muted px-2 py-1.5 text-center font-mono text-xs">
                {rc}
              </code>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={copyRecoveryCodes}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? t("copied") : t("copyCodes")}
            </Button>
            <Button onClick={() => setPhase("enabled")}>{t("savedCodes")}</Button>
          </div>
        </div>
      )}

      {phase === "enabled" && (
        <div className="mt-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Two-factor authentication is active{enabledAt ? ` since ${new Date(enabledAt).toLocaleDateString()}` : ""}.
            You&apos;ll be asked for a code at every sign-in.
          </p>
          {!showDisable ? (
            <Button variant="outline" onClick={() => { setShowDisable(true); setCode(""); setPassword(""); setError(""); }}>
              {t("disableTwoFactor")}
            </Button>
          ) : (
            <div className="space-y-3 rounded-xl border border-border/70 p-4">
              <p className="text-sm font-medium text-foreground">Confirm with your password and a current code:</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  type="password"
                  placeholder="Current password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-11"
                />
                <Input
                  inputMode="numeric"
                  placeholder="6-digit or recovery code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="destructive" onClick={disable} disabled={busy || !password || !code}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("disable2fa")}
                </Button>
                <Button variant="ghost" onClick={() => setShowDisable(false)}>{t("cancel")}</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
