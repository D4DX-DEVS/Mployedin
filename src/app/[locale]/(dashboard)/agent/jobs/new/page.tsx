"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, ArrowLeft, Briefcase, Building2, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CurrencySelect } from "@/components/ui/currency-select";
import { CountrySelect } from "@/components/ui/country-select";
import { JOB_CATEGORIES } from "@/components/features/employer/job-form/jobFormSchema";
import { PageHero } from "@/components/shared/PageHero";

const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "freelance",
] as const;

interface Employer {
  _id: string;
  name: string;
  companyName?: string;
}

export default function AgentJobPosterPage() {
  const router = useRouter();
  const t = useTranslations("agentJobNew");
  const common = useTranslations("agentCommon");
  const employmentTypeLabels: Record<(typeof EMPLOYMENT_TYPES)[number], string> = {
    full_time: t("employmentTypes.full_time"),
    part_time: t("employmentTypes.part_time"),
    contract: t("employmentTypes.contract"),
    internship: t("employmentTypes.internship"),
    freelance: t("employmentTypes.freelance"),
  };
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [selectedEmployer, setSelectedEmployer] = useState("");
  const [loadingEmployers, setLoadingEmployers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "",
    city: "",
    country: "",
    employmentType: "full_time",
    salaryMin: "",
    salaryMax: "",
    currency: "AED",
    description: "",
    requirements: "",
  });

  const loadEmployers = useCallback(async () => {
    try {
      const res = await fetch("/api/employers");
      if (res.ok) {
        const data = await res.json();
        setEmployers(data.employers ?? data);
      }
    } finally {
      setLoadingEmployers(false);
    }
  }, []);

  useEffect(() => { loadEmployers(); }, [loadEmployers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployer) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          category: form.category,
          location: { city: form.city, country: form.country },
          employmentType: form.employmentType,
          ...(form.salaryMin && form.salaryMax ? { salary: { min: parseInt(form.salaryMin), max: parseInt(form.salaryMax), currency: form.currency } } : {}),
          description: form.description,
          ...(form.requirements.trim() ? { requirements: { skills: form.requirements.split("\n").map((r) => r.trim()).filter(Boolean) } } : {}),
          employerId: selectedEmployer,
        }),
      });
      if (res.ok) {
        toast.success(t("toast.success"));
        router.push("../jobs");
      } else {
        const err = await res.json().catch(() => null);
        const detail = Array.isArray(err?.details) && err.details.length
          ? `${err.details[0].path}: ${err.details[0].message}`
          : null;
        toast.error(detail ?? err?.error ?? err?.message ?? t("toast.error"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = Boolean(
    selectedEmployer &&
    form.title.trim() &&
    form.category &&
    form.country &&
    form.city.trim() &&
    form.description.trim()
  );

  return (
    <div className="page-container">
      <PageHero
        icon={Briefcase}
        title={t("title")}
        description={t("description")}
        compactOnMobile
        actions={
          <Button variant="outline" onClick={() => router.back()} className="h-11 rounded-xl border-border/75 bg-card/90 hover:border-border hover:text-status-applied">
            <ArrowLeft className="h-4 w-4" />
            {common("back")}
          </Button>
        }
      />

      <section className="rounded-3xl border border-border bg-card/90 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur space-y-3 panel-body">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-status-applied" />
          <h3 className="heading-label font-semibold text-foreground">{t("employer.title")}</h3>
        </div>
        {loadingEmployers ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("employer.loading")}
          </div>
        ) : employers.length === 0 ? (
          <div className="flex items-center gap-2 rounded-2xl bg-status-shortlisted-bg p-3 text-sm text-status-shortlisted">
            <AlertCircle className="h-4 w-4" />
            {t("employer.empty")}
          </div>
        ) : (
          <Select value={selectedEmployer} onValueChange={setSelectedEmployer}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue placeholder={t("employer.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {employers.map((em) => (
                <SelectItem key={em._id} value={em._id}>
                  {em.companyName ?? em.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </section>

      <form onSubmit={handleSubmit} className="rounded-3xl border border-border bg-card/90 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur space-y-5 panel-body">
        <div className="flex items-center gap-2 mb-1">
          <Briefcase className="h-4 w-4 text-status-applied" />
          <h3 className="heading-label font-semibold text-foreground">{t("form.title")}</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t("form.jobTitle")}</label>
            <Input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t("form.jobTitlePlaceholder")}
              className="h-11 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t("form.category")}</label>
            <Select required value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder={t("form.categoryPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {JOB_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t("form.country")}</label>
            <CountrySelect
              value={form.country}
              onValueChange={(v) => setForm({ ...form, country: v })}
              className="h-11"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t("form.city")}</label>
            <Input
              required
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder={t("form.cityPlaceholder")}
              className="h-11 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t("form.employmentType")}</label>
            <Select value={form.employmentType} onValueChange={(v) => setForm({ ...form, employmentType: v })}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{employmentTypeLabels[type]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t("form.currency")}</label>
            <CurrencySelect
              value={form.currency}
              onValueChange={(v) => setForm({ ...form, currency: v })}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t("form.salaryMin")}</label>
            <Input
              type="number"
              value={form.salaryMin}
              onChange={(e) => setForm({ ...form, salaryMin: e.target.value })}
              placeholder={t("form.salaryMinPlaceholder")}
              className="h-11 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t("form.salaryMax")}</label>
            <Input
              type="number"
              value={form.salaryMax}
              onChange={(e) => setForm({ ...form, salaryMax: e.target.value })}
              placeholder={t("form.salaryMaxPlaceholder")}
              className="h-11 rounded-xl"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t("form.descriptionLabel")}</label>
          <Textarea
            required
            rows={5}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={t("form.descriptionPlaceholder")}
            className="rounded-xl resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t("form.requirements")}</label>
          <Textarea
            rows={4}
            value={form.requirements}
            onChange={(e) => setForm({ ...form, requirements: e.target.value })}
            placeholder={t("form.requirementsPlaceholder")}
            className="rounded-xl resize-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={() => router.back()} className="h-11 rounded-xl">
            {common("cancel")}
          </Button>
          <Button size="lg"
            type="submit"
            disabled={submitting || !canSubmit}
            className="rounded-xl bg-primary hover:bg-primary/90"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting ? t("form.posting") : t("form.submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
