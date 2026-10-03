"use client";

import { useState, useEffect, FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AlertCircle, Loader2 } from "lucide-react";
import { isFormError } from "@/lib/errors/form-error";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { StepFormDialog } from "@/components/shared/StepFormDialog";
import { EMAIL_PATTERN } from "@/lib/errors/email-pattern";
import { formatList } from "@/lib/i18n/formatList";

export interface CrudField {
  name: string;
  label: string;
  type: "text" | "email" | "number" | "select" | "textarea" | "date" | "password" | "phone";
  required?: boolean;
  placeholder?: string;
  /** Short rule shown under the input, e.g. the password policy. */
  hint?: string;
  options?: { value: string; label: string }[];
  min?: string;
}

export interface CrudStep {
  /** Short name shown in the progress indicator, e.g. "Contact". */
  label: string;
  /** Names of the `fields` shown on this step, in display order. */
  fields: string[];
}

interface CrudModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  fields: CrudField[];
  initialValues?: Record<string, string>;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  /** Optional warning node (e.g. duplicate detection) displayed above fields */
  warningNode?: React.ReactNode;
  /** Called when any field value changes */
  onValuesChange?: (values: Record<string, string>) => void;
  /** Split a form that would outgrow the frame into steps (StepFormDialog).
   *  Each step is checked before Next; a field no step lists is put on the
   *  last one rather than silently dropped. */
  steps?: CrudStep[];
}

export function CrudModal({ open, onClose, title, description, fields, initialValues, onSubmit, warningNode, onValuesChange, steps }: CrudModalProps) {
  const tc = useTranslations("common");
  const tf = useTranslations("formErrors");
  const locale = useLocale();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* Keyed on structure, not identity: callers rebuild `fields` and edit
     `initialValues` inline on every render, and a list fetch finishing while
     the modal was open used to reset every input to blank — the admin then
     hit "Please fill out this field" on values they had just typed. */
  const fieldSignature = fields.map((f) => f.name).join("\0");
  const initialSignature = JSON.stringify(initialValues ?? null);
  useEffect(() => {
    if (!open) return;
    const init: Record<string, string> = {};
    fields.forEach((f) => { init[f.name] = initialValues?.[f.name] ?? ""; });
    setValues(init);
    setError("");

  }, [open, fieldSignature, initialSignature]);

  const updateValue = (name: string, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [name]: value };
      onValuesChange?.(next);
      return next;
    });
  };

  const save = async () => {
    setError("");
    setLoading(true);
    try {
      await onSubmit(values);
      onClose();
    } catch (err) {
      // Only a FormError carries copy written for the screen (password rules,
      // duplicate email, field errors). Anything else stays behind generic text.
      const message = isFormError(err) ? err.message.trim() : "";
      setError(message || tf("fallback"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void save();
  };

  // StepFormDialog turns native validation off, so the checks the browser made
  // on the one-page form are made here and shown as one banner sentence.
  const stepError = (list: CrudField[]): string | null => {
    const missing = list.filter((f) => f.required && !(values[f.name] ?? "").trim());
    if (missing.length > 0) {
      return tf("requiredFields", { fields: formatList(missing.map((f) => f.label), locale) });
    }
    const badEmail = list.some((f) => {
      const value = (values[f.name] ?? "").trim();
      return f.type === "email" && value !== "" && !EMAIL_PATTERN.test(value);
    });
    return badEmail ? tf("emailInvalid") : null;
  };

  const renderField = (field: CrudField) => (
    <div key={field.name} className="space-y-2">
      <Label htmlFor={field.name}>
        {field.label}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>

      {field.type === "select" ? (
        <SearchableSelect
          id={field.name}
          options={field.options ?? []}
          value={values[field.name] ?? ""}
          onValueChange={(v) => updateValue(field.name, v)}
          placeholder={field.placeholder || "Select…"}
          modal
        />
      ) : field.type === "textarea" ? (
        <Textarea
          id={field.name}
          value={values[field.name] ?? ""}
          onChange={(e) => updateValue(field.name, e.target.value)}
          required={field.required}
          placeholder={field.placeholder}
          rows={3}
        />
      ) : field.type === "password" ? (
        <PasswordInput
          id={field.name}
          value={values[field.name] ?? ""}
          onChange={(value) => updateValue(field.name, value)}
          required={field.required}
          placeholder={field.placeholder}
          aria-describedby={field.hint ? `${field.name}-hint` : undefined}
        />
      ) : field.type === "phone" ? (
        <PhoneInput
          id={field.name}
          value={values[field.name] ?? ""}
          onChange={(value) => updateValue(field.name, value)}
          required={field.required}
          placeholder={field.placeholder}
        />
      ) : (
        <Input
          id={field.name}
          type={field.type}
          value={values[field.name] ?? ""}
          onChange={(e) => updateValue(field.name, e.target.value)}
          required={field.required}
          placeholder={field.placeholder}
          min={field.min}
          aria-describedby={field.hint ? `${field.name}-hint` : undefined}
        />
      )}
      {field.hint && (
        <p id={`${field.name}-hint`} className="text-xs text-muted-foreground">{field.hint}</p>
      )}
    </div>
  );

  if (steps && steps.length > 1) {
    const byName = new Map(fields.map((f) => [f.name, f]));
    const listed = new Set(steps.flatMap((s) => s.fields));
    const unlisted = fields.filter((f) => !listed.has(f.name));
    const stepFields = steps.map((step, index) => [
      ...step.fields.flatMap((name) => byName.get(name) ?? []),
      ...(index === steps.length - 1 ? unlisted : []),
    ]);
    return (
      <StepFormDialog
        open={open}
        onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
        title={title}
        description={description}
        steps={steps.map((step, index) => ({
          label: step.label,
          validate: () => stepError(stepFields[index]),
          content: (
            <>
              {warningNode}
              <div className="grid gap-4">{stepFields[index].map(renderField)}</div>
            </>
          ),
        }))}
        error={error}
        onErrorDismiss={() => setError("")}
        submitLabel={initialValues ? tc("update") : tc("create")}
        submittingLabel={tc("saving")}
        submitting={loading}
        onSubmit={() => { void save(); }}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[calc(100dvh-4rem)] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 text-sm text-destructive chip-pad">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {warningNode}

            <div className="grid gap-4">
              {fields.map(renderField)}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border/50 shrink-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? tc("saving") : initialValues ? tc("update") : tc("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
