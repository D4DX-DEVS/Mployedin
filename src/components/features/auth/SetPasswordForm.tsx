"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/shared/FieldError";
import { PasswordRequirements } from "@/components/shared/PasswordRequirements";
import { csrfFetch } from "@/lib/security/csrf-client";
import { validatePasswordForForm } from "@/lib/security/passwordPolicy";

type Field = "next" | "confirm";

interface SetPasswordFormProps {
  /** Distinguishes the field ids when two forms could share a page. */
  idPrefix: string;
  onSaved: () => void;
  onCancel?: () => void;
}

/**
 * The first password of an account that has none (made by an e-mail code or by
 * Google / Apple / LinkedIn). POST /api/users/set-password applies the sign-up
 * policy, refuses an account that already has one and e-mails the holder.
 *
 * Not a <form>: the settings pages wrap each tab in their own form, and a
 * nested form's submit would submit the page's settings instead.
 */
export function SetPasswordForm({ idPrefix, onSaved, onCancel }: SetPasswordFormProps) {
  const t = useTranslations("setPassword");
  const tf = useTranslations("formErrors");
  const locale = useLocale();
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const nextId = `${idPrefix}-new-password`;
  const confirmId = `${idPrefix}-confirm-password`;

  const submit = async () => {
    const nextErrors: Partial<Record<Field, string>> = {};
    const policy = validatePasswordForForm(next, { locale, t: tf });
    if (policy) nextErrors.next = policy;
    else if (confirm !== next) nextErrors.confirm = t("mismatch");
    setErrors(nextErrors);
    setFormError("");
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    try {
      const res = await csrfFetch("/api/users/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: next }),
      });
      if (res.ok) {
        onSaved();
        return;
      }
      // The route answers with codes; each has its own copy here.
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.status === 409) setFormError(t("alreadySet"));
      // Only a session that logged in within the last 15 minutes may set one.
      else if (data?.error === "REAUTH_REQUIRED") setFormError(t("reauth"));
      else if (res.status === 429) setFormError(t("tooMany"));
      else setFormError(t("failed"));
    } catch {
      setFormError(t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="space-y-4"
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
        <Label htmlFor={nextId} required>{t("newPassword")}</Label>
        <Input
          id={nextId}
          type="password"
          value={next}
          onChange={(e) => { setNext(e.target.value); setErrors((p) => ({ ...p, next: undefined })); }}
          autoComplete="new-password"
          aria-invalid={errors.next ? true : undefined}
          aria-describedby={`${nextId}-rules${errors.next ? ` ${nextId}-error` : ""}`}
          className="h-11"
        />
        <FieldError id={`${nextId}-error`} message={errors.next} />
        <PasswordRequirements id={`${nextId}-rules`} password={next} className="mt-2" />
      </div>
      <div className="field">
        <Label htmlFor={confirmId} required>{t("confirmPassword")}</Label>
        <Input
          id={confirmId}
          type="password"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirm: undefined })); }}
          autoComplete="new-password"
          aria-invalid={errors.confirm ? true : undefined}
          aria-describedby={errors.confirm ? `${confirmId}-error` : undefined}
          className="h-11"
        />
        <FieldError id={`${confirmId}-error`} message={errors.confirm} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void submit()} disabled={busy}>
          {busy && <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />}
          {t("save")}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {t("cancel")}
          </Button>
        )}
      </div>
    </div>
  );
}
