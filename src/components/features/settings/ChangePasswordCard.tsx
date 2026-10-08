"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { PASSWORD_MIN_LENGTH } from "@/lib/security/passwordPolicy";
import { csrfFetch } from "@/lib/security/csrf-client";

/**
 * Change password with the current one (POST /api/users/change-password).
 * Not a <form>: settings pages wrap their tabs in one already.
 */
export function ChangePasswordCard() {
  const t = useTranslations("accountSettings");
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    if (newPassword !== confirm) {
      setError(t("passwordMismatch"));
      return;
    }
    setBusy(true);
    try {
      const res = await csrfFetch("/api/users/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; details?: { message?: string }[] };
      if (!res.ok) {
        setError(data.details?.[0]?.message ?? data.error ?? t("genericError"));
        return;
      }
      setDone(true);
      setOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch {
      setError(t("genericError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card-base rounded-3xl panel-body">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <h2 className="heading-section font-semibold tracking-tight text-foreground">{t("passwordTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("passwordDescription")}</p>
        </div>
      </div>

      {done && !open && <p className="mt-4 text-sm font-medium text-emerald-700" role="status">{t("passwordChanged")}</p>}
      {error && <p className="mt-4 rounded-lg bg-destructive/10 chip-pad text-sm font-medium text-destructive" role="alert">{error}</p>}

      {!open ? (
        <Button type="button" variant="outline" className="mt-5 min-h-11" onClick={() => { setOpen(true); setDone(false); setError(""); }}>
          {t("changePassword")}
        </Button>
      ) : (
        // Enter must not implicitly submit a settings <form> this card sits in.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- keyboard delegation for the inputs inside
        <div
          role="group"
          className="mt-5 space-y-3 rounded-xl border border-border/70 card-pad"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!busy && currentPassword && newPassword && confirm) void submit(); } }}
        >
          <div className="field">
            <Label htmlFor="cp-current">{t("currentPassword")}</Label>
            <PasswordInput id="cp-current" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <Label htmlFor="cp-new">{t("newPassword")}</Label>
              <PasswordInput id="cp-new" value={newPassword} onChange={setNewPassword} aria-describedby="cp-hint" />
            </div>
            <div className="field">
              <Label htmlFor="cp-confirm">{t("confirmPassword")}</Label>
              <PasswordInput id="cp-confirm" value={confirm} onChange={setConfirm} />
            </div>
          </div>
          <p id="cp-hint" className="text-xs text-muted-foreground">{t("passwordHint", { min: PASSWORD_MIN_LENGTH })}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" onClick={submit} disabled={busy || !currentPassword || !newPassword || !confirm}>
              {busy && <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t("updatePassword")}
            </Button>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => { setOpen(false); setError(""); }} disabled={busy}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
