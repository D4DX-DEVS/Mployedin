"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Mail, Loader2, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Verified email-change card. Requests require the current password;
 * the change only applies after the link sent to the new address is confirmed.
 */
export function ChangeEmailCard() {
  const t = useTranslations("changeEmailCard");
  const [currentEmail, setCurrentEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    fetch("/api/user/email-change")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setCurrentEmail(data.email ?? "");
          setPendingEmail(data.pendingEmail ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/user/email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Request failed");
        return;
      }
      setPendingEmail(data.pendingEmail ?? newEmail);
      setOpen(false);
      setNewEmail("");
      setPassword("");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }, [newEmail, password]);

  const cancelPending = useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/user/email-change", { method: "DELETE" });
      setPendingEmail(null);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section className="card-base rounded-3xl panel-body">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("account")}</div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{t("emailAddress")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Changing your email requires your password and a confirmation link sent to the new address.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
          <Mail className="h-3.5 w-3.5" /> {loading ? "…" : currentEmail}
        </span>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
          <p className="text-sm font-medium text-destructive">{error}</p>
        </div>
      )}

      {pendingEmail && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div>
            <p className="text-sm font-semibold text-amber-700">
              Pending change to {pendingEmail}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Check the inbox of the new address and click the confirmation link (expires in 1 hour).
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={cancelPending} disabled={busy}>
            <XCircle className="mr-1.5 h-4 w-4" /> {t("cancel")}
          </Button>
        </div>
      )}

      {!pendingEmail && !loading && (
        !open ? (
          <Button variant="outline" className="mt-5" onClick={() => { setOpen(true); setError(""); }}>
            {t("changeEmailAddress")}
          </Button>
        ) : (
          <div className="mt-5 space-y-3 rounded-xl border border-border/70 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-email">{t("newEmailAddress")}</Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="new@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  autoComplete="email"
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-pwd">{t("currentPassword")}</Label>
                <Input
                  id="confirm-pwd"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-11"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={submit} disabled={busy || !newEmail || !password}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {t("sendConfirmationLink")}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            </div>
          </div>
        )
      )}
    </section>
  );
}
