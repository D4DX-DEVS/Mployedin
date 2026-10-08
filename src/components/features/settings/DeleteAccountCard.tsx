"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { csrfFetch } from "@/lib/security/csrf-client";

/**
 * GDPR erasure (DELETE /api/gdpr/export). The route wants `{ password }` for
 * accounts that have one; Google-only accounts have none, so it is sent only
 * when typed and the route's `password_confirmation_required` answer asks for it.
 */
export function DeleteAccountCard() {
  const t = useTranslations("accountSettings");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const erase = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await csrfFetch("/api/gdpr/export", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(password ? { password } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setError(
          data.error === "password_confirmation_required" ? t("deletePasswordRequired")
            : data.error === "invalid_password" ? t("deletePasswordInvalid")
              : data.message ?? data.error ?? t("genericError"),
        );
        return;
      }
      await signOut({ callbackUrl: `/${locale}` });
    } catch {
      setError(t("genericError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card-base rounded-3xl border border-destructive/20 panel-body">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <div>
          <h2 className="heading-section font-semibold tracking-tight text-destructive">{t("deleteTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("deleteDescription")}</p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className="mt-5 min-h-11 border-destructive/30 text-destructive hover:bg-destructive/10"
        onClick={() => { setOpen(true); setError(""); setPassword(""); }}
      >
        {t("deleteAccount")}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("deleteConfirmDescription")}</DialogDescription>
          </DialogHeader>
          <div className="field">
            <Label htmlFor="delete-account-pwd">{t("deletePasswordLabel")}</Label>
            <PasswordInput id="delete-account-pwd" value={password} onChange={setPassword} autoComplete="current-password" aria-describedby="delete-account-pwd-hint" />
            <p id="delete-account-pwd-hint" className="text-xs text-muted-foreground">{t("deletePasswordHint")}</p>
          </div>
          {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(false)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button type="button" variant="destructive" className="min-h-11" onClick={erase} disabled={busy}>
              {busy && <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
