"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Target,
  MapPin,
  DollarSign,
  Briefcase,
  Clock,
  Loader2,
  CheckCircle2,
  Plus,
  X,
} from "lucide-react";

const CURRENCIES = ["USD", "AED", "SAR", "EGP", "KWD", "QAR", "BHD", "OMR"];
const JOB_TYPES = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "Onsite" },
  { value: "any", label: "Any" },
];
const AVAILABILITY_OPTIONS = [
  { value: "immediately", label: "Immediately" },
  { value: "within_month", label: "Within 1 Month" },
  { value: "within_3_months", label: "Within 3 Months" },
  { value: "not_available", label: "Not Available" },
];

interface PreferencesData {
  preferredRoles: string[];
  preferredCountries: string[];
  preferredSalary: { min: number; max: number; currency: string };
  preferredJobType: string;
  availabilityStatus: string;
  noticePeriod: number;
}

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
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
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

function TagInput({
  tags,
  onAdd,
  onRemove,
  placeholder,
}: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  const handleAdd = () => {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onAdd(trimmed);
      setInput("");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
          >
            {tag}
            <button
              onClick={() => onRemove(tag)}
              className="hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
          placeholder={placeholder}
          className="h-9 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          className="h-9 px-3"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function JobPreferencesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [prefs, setPrefs] = useState<PreferencesData>({
    preferredRoles: [],
    preferredCountries: [],
    preferredSalary: { min: 0, max: 0, currency: "USD" },
    preferredJobType: "any",
    availabilityStatus: "immediately",
    noticePeriod: 0,
  });

  const loadPreferences = useCallback(async () => {
    try {
      const res = await fetch("/api/job-seekers/me");
      if (res.ok) {
        const data = await res.json();
        const js = data.jobSeeker;
        setPrefs({
          preferredRoles: js.preferredRoles ?? [],
          preferredCountries: js.preferredCountries ?? [],
          preferredSalary: js.preferredSalary ?? { min: 0, max: 0, currency: "USD" },
          preferredJobType: js.preferredJobType ?? "any",
          availabilityStatus: js.availabilityStatus ?? "immediately",
          noticePeriod: js.noticePeriod ?? 0,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/job-seekers/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Job Preferences"
        description="Set your preferences to get better job matches and recommendations"
      />

      <div className="grid gap-6 max-w-3xl">
        {/* Preferred Roles */}
        <Section
          icon={<Target className="h-4 w-4" />}
          title="Preferred Roles"
          description="What job titles are you looking for?"
        >
          <TagInput
            tags={prefs.preferredRoles}
            onAdd={(tag) =>
              setPrefs((p) => ({
                ...p,
                preferredRoles: [...p.preferredRoles, tag],
              }))
            }
            onRemove={(tag) =>
              setPrefs((p) => ({
                ...p,
                preferredRoles: p.preferredRoles.filter((r) => r !== tag),
              }))
            }
            placeholder="e.g. Frontend Developer, Product Manager…"
          />
        </Section>

        {/* Preferred Locations */}
        <Section
          icon={<MapPin className="h-4 w-4" />}
          title="Preferred Locations"
          description="Where do you want to work?"
        >
          <TagInput
            tags={prefs.preferredCountries}
            onAdd={(tag) =>
              setPrefs((p) => ({
                ...p,
                preferredCountries: [...p.preferredCountries, tag],
              }))
            }
            onRemove={(tag) =>
              setPrefs((p) => ({
                ...p,
                preferredCountries: p.preferredCountries.filter(
                  (c) => c !== tag
                ),
              }))
            }
            placeholder="e.g. UAE, Saudi Arabia, Qatar…"
          />
        </Section>

        {/* Salary Expectations */}
        <Section
          icon={<DollarSign className="h-4 w-4" />}
          title="Salary Expectations"
          description="What is your expected salary range?"
        >
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Minimum
              </label>
              <Input
                type="number"
                min={0}
                value={prefs.preferredSalary.min || ""}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    preferredSalary: {
                      ...p.preferredSalary,
                      min: Number(e.target.value) || 0,
                    },
                  }))
                }
                className="h-9 text-sm"
                placeholder="0"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Maximum
              </label>
              <Input
                type="number"
                min={0}
                value={prefs.preferredSalary.max || ""}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    preferredSalary: {
                      ...p.preferredSalary,
                      max: Number(e.target.value) || 0,
                    },
                  }))
                }
                className="h-9 text-sm"
                placeholder="0"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Currency
              </label>
              <Select
                value={prefs.preferredSalary.currency}
                onValueChange={(v) =>
                  setPrefs((p) => ({
                    ...p,
                    preferredSalary: { ...p.preferredSalary, currency: v },
                  }))
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Section>

        {/* Job Type */}
        <Section
          icon={<Briefcase className="h-4 w-4" />}
          title="Job Type"
          description="What type of work arrangement do you prefer?"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {JOB_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() =>
                  setPrefs((p) => ({ ...p, preferredJobType: type.value }))
                }
                className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  prefs.preferredJobType === type.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40"
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Availability & Notice Period */}
        <Section
          icon={<Clock className="h-4 w-4" />}
          title="Availability"
          description="When can you start a new role?"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Availability
              </label>
              <Select
                value={prefs.availabilityStatus}
                onValueChange={(v) =>
                  setPrefs((p) => ({ ...p, availabilityStatus: v }))
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABILITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Notice Period (days)
              </label>
              <Input
                type="number"
                min={0}
                max={365}
                value={prefs.noticePeriod || ""}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    noticePeriod: Number(e.target.value) || 0,
                  }))
                }
                className="h-9 text-sm"
                placeholder="0"
              />
            </div>
          </div>
        </Section>

        {/* Save Button */}
        <div className="flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="min-w-[140px]"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : saved ? (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Saved!
              </>
            ) : (
              "Save Preferences"
            )}
          </Button>
          {saved && (
            <span className="text-sm text-green-600">
              Preferences updated successfully
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
