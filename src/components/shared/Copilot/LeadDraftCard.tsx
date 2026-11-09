"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangle, Briefcase, Building2, CheckCircle2, ExternalLink, FileText, Globe, Loader2,
  Mail, MapPin, Pencil, Phone, UserRound, Factory, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LeadPosterResult } from "@/lib/leads/posterClient";
import type { LeadPosterValues } from "@/lib/leads/posterExtract";

export type LeadDraftStatus = "editing" | "saving" | "saved" | "failed";

/** The editable subset shown on the card; the rest rides along unchanged. */
type CardField = "companyName" | "contactPerson" | "contactEmail" | "contactPhone" | "city" | "country" | "industry";

const FIELDS: { name: CardField; icon: LucideIcon; labelKey: string; type?: string; required?: boolean }[] = [
  { name: "companyName", icon: Building2, labelKey: "leadDraftCompany", required: true },
  { name: "contactPerson", icon: UserRound, labelKey: "leadDraftContact", required: true },
  { name: "contactEmail", icon: Mail, labelKey: "leadDraftEmail", type: "email" },
  { name: "contactPhone", icon: Phone, labelKey: "leadDraftPhone", type: "tel" },
  { name: "city", icon: MapPin, labelKey: "leadDraftCity" },
  { name: "country", icon: Globe, labelKey: "leadDraftCountry" },
  { name: "industry", icon: Factory, labelKey: "leadDraftIndustry" },
];

interface Duplicate { _id: string; companyName: string; contactEmail?: string }

interface LeadDraftCardProps {
  draft: LeadPosterResult;
  status: LeadDraftStatus;
  leadId?: string;
  error?: string;
  /** Thumbnail of the uploaded image, while this session still holds it. */
  previewUrl?: string;
  onCreate: (values: LeadPosterValues) => void;
  onOpenForm: (values: LeadPosterValues) => void;
  onInternalLink: () => void;
}

/**
 * What Copilot read off a hiring poster, as a lead ready to check: every
 * field editable in place, the ones the AI was unsure of marked, the roles
 * as chips, possible duplicates flagged — then one click creates the lead
 * (with the poster attached) or hands it to the full New Lead form.
 */
export function LeadDraftCard({ draft, status, leadId, error, previewUrl, onCreate, onOpenForm, onInternalLink }: LeadDraftCardProps) {
  const t = useTranslations("copilot");
  const locale = useLocale();
  const [values, setValues] = useState<LeadPosterValues>(draft.values);
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const unsure = useMemo(() => new Set<string>(draft.unsure), [draft.unsure]);
  const locked = status === "saving" || status === "saved";
  const missing = !values.companyName.trim() || values.companyName.trim().length < 2
    || !values.contactPerson.trim() || values.contactPerson.trim().length < 2;

  // Same duplicate check the New Lead form runs.
  useEffect(() => {
    if (status === "saved") return;
    const params = new URLSearchParams();
    if (values.companyName.trim()) params.set("companyName", values.companyName.trim());
    if (values.contactEmail.trim()) params.set("contactEmail", values.contactEmail.trim());
    if (values.contactPhone.trim()) params.set("contactPhone", values.contactPhone.trim());
    if (!params.toString()) { setDuplicates([]); return; }
    const timer = setTimeout(() => {
      fetch(`/api/leads/check-duplicates?${params}`)
        .then((r) => (r.ok ? r.json() : { duplicates: [] }))
        .then((d: { duplicates?: Duplicate[] }) => setDuplicates(d.duplicates ?? []))
        .catch(() => { /* a hint only */ });
    }, 500);
    return () => clearTimeout(timer);
  }, [values.companyName, values.contactEmail, values.contactPhone, status]);

  const set = (name: CardField, value: string) => setValues((prev) => ({ ...prev, [name]: value }));

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-label={t("leadDraftTitle")}>
      {/* Header: poster + what was found */}
      <div className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-3">
        {previewUrl
          ? <img src={previewUrl} alt={t("leadDraftPosterAlt")} className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover shadow-sm" />
          : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-primary/10"><FileText className="size-5 text-primary" aria-hidden="true" /></span>}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{t("leadDraftTitle")}</p>
          <p dir="auto" className="truncate text-base font-semibold text-foreground">{values.companyName || t("leadDraftNoCompany")}</p>
          <p dir="auto" className="truncate text-xs text-muted-foreground">{draft.posterName}</p>
        </div>
        {status === "saved" && <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-label={t("leadDraftSaved")} />}
      </div>

      <div className="space-y-3 p-3">
        {draft.roles.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Briefcase className="size-3.5" aria-hidden="true" />
              {t("leadDraftRoles", { count: draft.roles.reduce((n, r) => n + r.count, 0) })}
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {draft.roles.map((role) => (
                <li key={role.title} dir="auto" className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-foreground">
                  {role.title}{role.count > 1 && <span className="ms-1 tabular-nums text-primary">×{role.count}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FIELDS.map((field) => {
            const flagged = unsure.has(field.name) && status !== "saved";
            const id = `lead-draft-${field.name}`;
            return (
              <div key={field.name} className={cn("min-w-0", ["companyName", "contactPerson", "contactEmail"].includes(field.name) && "sm:col-span-2")}>
                <label htmlFor={id} className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <field.icon className="size-3" aria-hidden="true" />
                  {t(field.labelKey)}{field.required && <span aria-hidden="true">*</span>}
                  {flagged && <span className="ms-auto rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">{t("leadDraftCheck")}</span>}
                </label>
                <Input
                  id={id}
                  type={field.type ?? "text"}
                  dir="auto"
                  value={values[field.name]}
                  onChange={(e) => set(field.name, e.target.value)}
                  disabled={locked}
                  required={field.required}
                  aria-invalid={flagged || undefined}
                  className={cn("h-9 text-sm", flagged && "border-amber-400 bg-amber-50/60 focus-visible:ring-amber-400")}
                />
              </div>
            );
          })}
        </div>

        {duplicates.length > 0 && status !== "saved" && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900" role="status">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold">{t("leadDraftDuplicates")}</p>
              <ul className="mt-0.5 space-y-0.5">
                {duplicates.slice(0, 3).map((d) => (
                  <li key={d._id} dir="auto" className="truncate">{d.companyName}{d.contactEmail ? ` · ${d.contactEmail}` : ""}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {status === "failed" && error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive" role="alert">{error}</p>
        )}

        {status === "saved" ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 text-sm font-medium text-emerald-700">{t("leadDraftSaved")}</p>
            {leadId && (
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link href={`/${locale}/agent/leads?lead=${leadId}`} onClick={onInternalLink}>
                  {t("leadDraftOpen")} <ExternalLink className="size-3.5" aria-hidden="true" />
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">{draft.unsure.length > 0 ? t("leadDraftCheckHint") : t("leadDraftReviewHint")}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" size="sm" variant="outline" className="min-h-11 gap-1.5 sm:min-h-8" disabled={locked} onClick={() => onOpenForm(values)}>
                <Pencil className="size-3.5" aria-hidden="true" /> {t("leadDraftFullForm")}
              </Button>
              <Button type="button" size="sm" className="min-h-11 gap-1.5 sm:min-h-8" disabled={locked || missing} onClick={() => onCreate(values)}>
                {status === "saving" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-3.5" aria-hidden="true" />}
                {status === "saving" ? t("leadDraftSaving") : t("leadDraftCreate")}
              </Button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
