"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  User2,
  Heart,
  Calendar,
  Globe2,
  MapPin,
  Languages,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import {
  FormInput,
  FormDatePicker,
  FormMultiSelect,
  FormSelect,
} from "@/components/shared/AppForm";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LookupItem {
  _id: string;
  name: string;
  nameAr: string;
  slug: string;
}

interface CountryItem {
  _id: string;
  name: string;
  nameAr: string;
  code: string;
}

interface LanguageEntry {
  language: string;
  proficiency: "basic" | "conversational" | "professional" | "native";
}

interface FormState {
  genderId: string;
  maritalStatusId: string;
  dateOfBirth: string;
  workPermitCountries: string[];
  permanentAddress: string;
  hometown: string;
  pincode: string;
  languages: LanguageEntry[];
}

const EMPTY: FormState = {
  genderId: "",
  maritalStatusId: "",
  dateOfBirth: "",
  workPermitCountries: [],
  permanentAddress: "",
  hometown: "",
  pincode: "",
  languages: [],
};

const PROFICIENCY_OPTIONS = [
  { value: "basic", label: "Basic" },
  { value: "conversational", label: "Conversational" },
  { value: "professional", label: "Professional" },
  { value: "native", label: "Native" },
];

// Max DOB: user must be at least 16 years old
function maxDob(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 16);
  return d.toISOString().split("T")[0];
}

// ─── Chip Group ───────────────────────────────────────────────────────────────

function ChipGroup({
  label,
  hint,
  items,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  items: LookupItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const selected = value === item._id;
          return (
            <button
              key={item._id}
              type="button"
              onClick={() => onChange(selected ? "" : item._id)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-all",
                selected
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-background text-foreground hover:border-primary/60 hover:bg-primary/5"
              )}
            >
              {item.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary shrink-0">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PersonalDetailsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");

  const [genders, setGenders] = useState<LookupItem[]>([]);
  const [maritalStatuses, setMaritalStatuses] = useState<LookupItem[]>([]);
  const [countries, setCountries] = useState<CountryItem[]>([]);

  const [form, setForm] = useState<FormState>(EMPTY);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load data ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [profileRes, optionsRes] = await Promise.all([
        fetch("/api/job-seeker/profile"),
        fetch("/api/job-seeker/personal-details-options"),
      ]);

      if (optionsRes.ok) {
        const opts = await optionsRes.json();
        setGenders(opts.genders ?? []);
        setMaritalStatuses(opts.maritalStatuses ?? []);
        setCountries(opts.countries ?? []);
      }

      if (profileRes.ok) {
        const p = await profileRes.json();
        setForm({
          genderId: p?.genderId ?? "",
          maritalStatusId: p?.maritalStatusId ?? "",
          dateOfBirth: p?.dateOfBirth
            ? new Date(p.dateOfBirth).toISOString().split("T")[0]
            : "",
          workPermitCountries: (p?.workPermitCountries ?? []).map((id: unknown) =>
            typeof id === "string" ? id : String(id)
          ),
          permanentAddress: p?.permanentAddress ?? "",
          hometown: p?.hometown ?? "",
          pincode: p?.pincode ?? "",
          languages: p?.languages ?? [],
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Personal Details · MPLOYEDIN";
    load();
  }, [load]);

  // ── Field helpers ───────────────────────────────────────────────────────────

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addLanguage() {
    setForm((prev) => ({
      ...prev,
      languages: [...prev.languages, { language: "", proficiency: "conversational" }],
    }));
  }

  function updateLanguage(idx: number, patch: Partial<LanguageEntry>) {
    setForm((prev) => ({
      ...prev,
      languages: prev.languages.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  }

  function removeLanguage(idx: number) {
    setForm((prev) => ({
      ...prev,
      languages: prev.languages.filter((_, i) => i !== idx),
    }));
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      genderId: form.genderId || undefined,
      maritalStatusId: form.maritalStatusId || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      workPermitCountries: form.workPermitCountries,
      permanentAddress: form.permanentAddress || undefined,
      hometown: form.hometown || undefined,
      pincode: form.pincode || undefined,
      languages: form.languages.filter((l) => l.language.trim()),
    };

    try {
      const res = await fetch("/api/job-seeker/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setSaveState(res.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    } finally {
      setSaving(false);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveState("idle"), 3000);
    }
  };

  // ── Country options for MultiSelect ─────────────────────────────────────────

  const countryOptions = countries.map((c) => ({
    value: c._id,
    label: `${c.name} (${c.code})`,
  }));

  // ── Skeleton ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page-container">
        <div className="max-w-2xl mx-auto w-full space-y-4">
          <div className="h-20 rounded-xl bg-muted animate-pulse" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Personal Details"
        description="Tell employers more about you — helps with equal opportunity matching"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("../profile")}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Profile
          </Button>
        }
      />

      <div className="max-w-2xl mx-auto w-full space-y-5">

        {/* ── Gender ──────────────────────────────────────────────────────── */}
        <Section
          icon={<User2 className="h-4 w-4" />}
          title="Gender"
          description="Select your gender identity"
        >
          <ChipGroup
            label="Gender"
            items={genders}
            value={form.genderId}
            onChange={(id) => setField("genderId", id)}
          />
        </Section>

        {/* ── Marital Status ───────────────────────────────────────────────── */}
        <Section
          icon={<Heart className="h-4 w-4" />}
          title="Marital Status"
          description="Your current marital status"
        >
          <ChipGroup
            label="Marital Status"
            items={maritalStatuses}
            value={form.maritalStatusId}
            onChange={(id) => setField("maritalStatusId", id)}
          />
        </Section>

        {/* ── Date of Birth ────────────────────────────────────────────────── */}
        <Section
          icon={<Calendar className="h-4 w-4" />}
          title="Date of Birth"
          description="You must be at least 16 years old"
        >
          <FormDatePicker
            label="Date of Birth"
            value={form.dateOfBirth}
            onChange={(v) => setField("dateOfBirth", v)}
            max={maxDob()}
          />
        </Section>

        {/* ── Work Permit ──────────────────────────────────────────────────── */}
        <Section
          icon={<Globe2 className="h-4 w-4" />}
          title="Work Authorization"
          description="Countries where you are legally authorized to work"
        >
          <FormMultiSelect
            label="Work Permit Countries"
            hint="You can choose up to 5 countries"
            options={countryOptions}
            value={form.workPermitCountries}
            onChange={(v) => setField("workPermitCountries", v)}
            maxSelections={5}
            searchable
            placeholder="Select countries…"
          />
        </Section>

        {/* ── Address ──────────────────────────────────────────────────────── */}
        <Section
          icon={<MapPin className="h-4 w-4" />}
          title="Address"
          description="Your residential address details"
        >
          <FormInput
            label="Permanent Address"
            placeholder="Enter your permanent address"
            value={form.permanentAddress}
            onChange={(e) => setField("permanentAddress", e.target.value)}
            maxLength={500}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Hometown"
              placeholder="Your hometown"
              value={form.hometown}
              onChange={(e) => setField("hometown", e.target.value)}
              maxLength={200}
            />
            <FormInput
              label="Pincode / Postal Code"
              placeholder="Postal code"
              value={form.pincode}
              onChange={(e) => setField("pincode", e.target.value)}
              maxLength={20}
            />
          </div>
        </Section>

        {/* ── Language Proficiency ─────────────────────────────────────────── */}
        <Section
          icon={<Languages className="h-4 w-4" />}
          title="Language Proficiency"
          description="Strengthen your resume by letting recruiters know your languages"
        >
          <div className="space-y-3">
            {form.languages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No languages added yet. Click &quot;Add Language&quot; below.
              </p>
            )}

            {form.languages.map((entry, idx) => (
              <div key={idx} className="flex items-end gap-3">
                <div className="flex-1">
                  <FormInput
                    label={idx === 0 ? "Language" : undefined}
                    placeholder="e.g. English, Arabic…"
                    value={entry.language}
                    onChange={(e) => updateLanguage(idx, { language: e.target.value })}
                    maxLength={100}
                  />
                </div>
                <div className="w-44 shrink-0">
                  <FormSelect
                    label={idx === 0 ? "Proficiency" : undefined}
                    options={PROFICIENCY_OPTIONS}
                    value={entry.proficiency}
                    onChange={(v) =>
                      updateLanguage(idx, { proficiency: v as LanguageEntry["proficiency"] })
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLanguage(idx)}
                  className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-destructive hover:text-destructive transition-colors"
                  aria-label="Remove language"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLanguage}
              disabled={form.languages.length >= 15}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add Language
            </Button>
          </div>
        </Section>

        {/* ── Save Bar ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm">
            {saveState === "saved" && (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="text-emerald-600 font-medium">Saved successfully</span>
              </>
            )}
            {saveState === "error" && (
              <>
                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                <span className="text-destructive font-medium">Failed to save — please try again</span>
              </>
            )}
            {saveState === "idle" && (
              <span className="text-muted-foreground">
                Fill in your details and click Save
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("../profile")}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
