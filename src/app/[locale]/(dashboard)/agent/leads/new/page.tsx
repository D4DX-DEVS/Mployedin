"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Building2, CalendarClock, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";

export default function NewLeadPage() {
  const router = useRouter();
  const t = useTranslations("agentLeadsNew");
  const tc = useTranslations("common");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    contactPerson: "",
    contactEmail: "",
    contactPhone: "",
    country: "",
    industry: "",
    source: "",
    notes: "",
    followUpAt: "",
  });

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(form)) {
      if (v) body[k] = v;
    }
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.back();
    } else {
      const err = await res.json();
      toast.error(err.error ?? t("failedToCreateLead"));
    }
    setSaving(false);
  };

  const Field = ({ label, name, type = "text", required = false }: { label: string; name: string; type?: string; required?: boolean }) => (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      <input
        type={type}
        value={form[name as keyof typeof form]}
        onChange={(e) => set(name, e.target.value)}
        required={required}
        className="input-field w-full h-9"
      />
    </div>
  );

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 backdrop-blur"><Sparkles className="h-3.5 w-3.5" />{t("agentWorkspace")}</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">{t("pageTitle")}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{t("pageDescription")}</p>
          </div>
          <Link href=".." className="inline-flex items-center gap-2 rounded-xl border border-white/80 bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-sky-200 hover:text-sky-700">
            <ArrowRight className="h-4 w-4" />
            {t("backToPipeline")}
          </Link>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur sm:p-6">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-sky-600" />
            <p className="text-sm font-semibold text-slate-950">{t("sectionCompanyAndContact")}</p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("labelCompanyName")} name="companyName" required />
            <Field label={t("labelContactPerson")} name="contactPerson" required />
            <Field label={tc("email")} name="contactEmail" type="email" />
            <Field label={tc("phone")} name="contactPhone" type="tel" />
            <Field label={tc("country")} name="country" />

            <div className="space-y-1">
              <label className="text-sm font-medium">{t("labelIndustry")}</label>
              <Select value={form.industry} onValueChange={(value) => set("industry", value)}>
                <SelectTrigger className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                  <SelectValue placeholder={t("selectIndustryPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {[
                    t("industryConstruction"),
                    t("industryIT"),
                    t("industryHealthcare"),
                    t("industryHospitality"),
                    t("industryRetail"),
                    t("industryManufacturing"),
                    t("industryFinance"),
                    t("industryEducation"),
                    t("industryOilGas"),
                    t("industryOther"),
                  ].map((industry) => (
                    <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">{t("labelSource")}</label>
              <Select value={form.source} onValueChange={(value) => set("source", value)}>
                <SelectTrigger className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                  <SelectValue placeholder={t("selectSourcePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {[
                    t("sourceReferral"),
                    t("sourceColdCall"),
                    t("sourceLinkedIn"),
                    t("sourceWebsite"),
                    t("sourceEvent"),
                    t("sourceOther"),
                  ].map((source) => (
                    <SelectItem key={source} value={source}>{source}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">{t("labelFollowUpDate")}</label>
              <DateTimePicker mode="date" value={form.followUpAt} onChange={(value) => set("followUpAt", value)} />
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-sky-600" />
            <p className="text-sm font-semibold text-slate-950">{t("sectionContextAndNotes")}</p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">{t("labelNotes")}</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 items-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
            >
              {saving ? t("savingButton") : t("createLeadButton")}
            </button>
            <Link
              href=".."
              className="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition-colors hover:border-sky-200 hover:text-sky-700"
            >
              {tc("cancel")}
            </Link>
          </div>
        </section>
      </form>
    </div>
  );
}
