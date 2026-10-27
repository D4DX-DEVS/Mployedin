"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/shared/FieldError";
import { PasswordRequirements } from "@/components/shared/PasswordRequirements";
import { csrfFetch } from "@/lib/security/csrf-client";
import { validatePasswordForForm } from "@/lib/security/passwordPolicy";

type Field = "current" | "next" | "confirm";

/**
 * Change the sign-in password from Settings. POST /api/users/change-password
 * checks the current password, applies the same policy as sign-up and emails
 * the account holder; the checklist shows that policy while they type.
 *
 * Not a <form>: settings pages wrap every tab in their own form, and a nested
 * form's submit (button or Enter) submits the page's settings instead.
 */
export function ChangePasswordCard() {
  const t = useTranslations("changePasswordCard");
  const tf = useTranslations("formErrors");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setOpen(false);
    setCurrent("");
    setNext("");
    setConfirm("");
    setErrors({});
    setFormError("");
  };

  const submit = async () => {
    const nextErrors: Partial<Record<Field, string>> = {};
    if (!current) nextErrors.current = tf("passwordRequired");
    const policy = validatePasswordForForm(next, { locale, t: tf });
    if (policy) nextErrors.next = policy;
    else if (next === current) nextErrors.next = t("sameAsCurrent");
    if (!nextErrors.next && confirm !== next) nextErrors.confirm = t("mismatch");
    setErrors(nextErrors);
    setFormError("");
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    try {
      const res = await csrfFetch("/api/users/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (res.ok) {
        toast.success(t("success"));
        reset();
        return;
      }
      // The route answers in English; each status has its own copy here.
      if (res.status === 403) setErrors({ current: t("wrongCurrent") });
      else if (res.status === 429) setFormError(t("tooMany"));
      else if (res.status === 400) {
        const data = await res.json().catch(() => null);
        setFormError(/OAuth/i.test(String(data?.error ?? "")) ? t("noPassword") : t("failed"));
      } else setFormError(t("failed"));
    } catch {
      setFormError(t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card-base rounded-3xl panel-body">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("eyebrow")}</div>
          <h2 className="heading-section mt-1 font-semibold tracking-tight text-foreground">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <KeyRound className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>

      {!open ? (
        <Button variant="outline" className="mt-5" onClick={() => setOpen(true)}>
          {t("open")}
        </Button>
      ) : (
        <div
          className="mt-5 space-y-4 rounded-xl border border-border/70 card-pad"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
              e.preventDefault();
              if (!busy) void submit();
            }
          }}
        >
          {formError && (
            <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 chip-pad text-sm font-medium text-destructive">
              {formError}
            </p>
          )}
          <div className="field">
            <Label htmlFor="current-password" required>{t("currentPassword")}</Label>
            <Input
              id="current-password"
              type="password"
              value={current}
              onChange={(e) => { setCurrent(e.target.value); setErrors((p) => ({ ...p, current: undefined })); }}
              autoComplete="current-password"
              aria-invalid={errors.current ? true : undefined}
              aria-describedby={errors.current ? "current-password-error" : undefined}
              className="h-11"
            />
            <FieldError id="current-password-error" message={errors.current} />
          </div>
          <div className="field">
            <Label htmlFor="new-password" required>{t("newPassword")}</Label>
            <Input
              id="new-password"
              type="password"
              value={next}
              onChange={(e) => { setNext(e.target.value); setErrors((p) => ({ ...p, next: undefined })); }}
              autoComplete="new-password"
              aria-invalid={errors.next ? true : undefined}
              aria-describedby={`new-password-rules${errors.next ? " new-password-error" : ""}`}
              className="h-11"
            />
            <FieldError id="new-password-error" message={errors.next} />
            <PasswordRequirements id="new-password-rules" password={next} className="mt-2" />
          </div>
          <div className="field">
            <Label htmlFor="confirm-new-password" required>{t("confirmPassword")}</Label>
            <Input
              id="confirm-new-password"
              type="password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirm: undefined })); }}
              autoComplete="new-password"
              aria-invalid={errors.confirm ? true : undefined}
              aria-describedby={errors.confirm ? "confirm-new-password-error" : undefined}
              className="h-11"
            />
            <FieldError id="confirm-new-password-error" message={errors.confirm} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void submit()} disabled={busy}>
              {busy && <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />}
              {t("save")}
            </Button>
            <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
