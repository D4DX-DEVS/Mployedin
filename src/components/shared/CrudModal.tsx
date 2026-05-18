"use client";

import { useState, useEffect, FormEvent } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AlertCircle, AlertTriangle, Loader2 } from "lucide-react";

export interface CrudField {
  name: string;
  label: string;
  type: "text" | "email" | "number" | "select" | "textarea" | "date";
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  min?: string;
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
}

export function CrudModal({ open, onClose, title, description, fields, initialValues, onSubmit, warningNode, onValuesChange }: CrudModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      const init: Record<string, string> = {};
      fields.forEach((f) => { init[f.name] = initialValues?.[f.name] ?? ""; });
      setValues(init);
      setError("");
    }
  }, [open, initialValues, fields]);

  const updateValue = (name: string, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [name]: value };
      onValuesChange?.(next);
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onSubmit(values);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

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
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {warningNode}

            <div className="grid gap-4">
              {fields.map((field) => (
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
                      placeholder={field.placeholder || "Select\u2026"}
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
                  ) : (
                    <Input
                      id={field.name}
                      type={field.type}
                      value={values[field.name] ?? ""}
                      onChange={(e) => updateValue(field.name, e.target.value)}
                      required={field.required}
                      placeholder={field.placeholder}
                      min={field.min}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border/50 shrink-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Saving\u2026" : initialValues ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
