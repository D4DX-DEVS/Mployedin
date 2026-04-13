"use client";

import { Suspense, useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Save, Building2, Globe, Phone, Mail, Shield, FileText,
  Briefcase, Bell, AlertTriangle, Linkedin, Twitter, Facebook, Instagram,
  MapPin, Calendar, Users, Eye, Link2, CheckCircle2, Clock, Sparkles,
  ChevronRight, Camera, X, Upload, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { LogoUpload } from "@/components/features/employer/LogoUpload";
import { useConfirm } from "@/hooks/useConfirm";
import { useEmployerProfile, useUpdateEmployerProfile, useUploadDocument, useDeleteDocument } from "@/hooks/useEmployerProfile";
import type { CompanyData } from "@/hooks/useEmployerProfile";

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  "Technology", "Healthcare", "Finance", "Construction", "Hospitality",
  "Education", "Manufacturing", "Logistics", "Oil & Gas", "Retail",
  "Real Estate", "Consulting", "Telecommunications", "Media", "Other",
];

const COMPANY_SIZES = [
  "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001+",
];

const WORK_TYPES = [
  { value: "remote", label: "Remote" },
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "flexible", label: "Flexible" },
];

const VERIFICATION_BADGES: Record<string, { label: string; color: string; icon: typeof Shield }> = {
  basic: { label: "Basic", color: "bg-slate-100 text-slate-600 border-slate-200", icon: Shield },
  company: { label: "Verified", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  premium: { label: "Premium", color: "bg-amber-50 text-amber-700 border-amber-200", icon: Sparkles },
};

type TabKey = "profile" | "contact" | "hiring" | "notifications" | "account";

const NAV_ITEMS: { key: TabKey; label: string; desc: string; icon: typeof Building2 }[] = [
  { key: "profile", label: "Company Profile", desc: "Logo, name, industry & about", icon: Building2 },
  { key: "contact", label: "Contact & Social", desc: "Email, phone, website & links", icon: Link2 },
  { key: "hiring", label: "Hiring Preferences", desc: "Defaults for new job posts", icon: Briefcase },
  { key: "notifications", label: "Notifications", desc: "Email & in-app alerts", icon: Bell },
  { key: "account", label: "Account & Security", desc: "Verification, plan & danger zone", icon: Shield },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  companyName: string;
  description: string;
  industry: string;
  companySize: string;
  foundedYear: string;
  designation: string;
  address: string;
  companyEmail: string;
  phone: string;
  website: string;
  linkedin: string;
  twitter: string;
  facebook: string;
  instagram: string;
  defaultVisibility: string;
  workType: string;
  preferredLocations: string;
  emailNewApplicant: boolean;
  emailInterviewScheduled: boolean;
  emailOfferResponse: boolean;
  emailWeeklyDigest: boolean;
  inAppAll: boolean;
}

function buildInitialForm(emp?: CompanyData | null): FormData {
  return {
    companyName: emp?.companyName ?? "",
    description: emp?.description ?? "",
    industry: emp?.industry ?? "",
    companySize: emp?.companySize ?? "",
    foundedYear: emp?.foundedYear ? String(emp.foundedYear) : "",
    designation: emp?.designation ?? "",
    address: emp?.address ?? "",
    companyEmail: emp?.companyEmail ?? "",
    phone: emp?.phone ?? "",
    website: emp?.website ?? "",
    linkedin: emp?.socialLinks?.linkedin ?? "",
    twitter: emp?.socialLinks?.twitter ?? "",
    facebook: emp?.socialLinks?.facebook ?? "",
    instagram: emp?.socialLinks?.instagram ?? "",
    defaultVisibility: emp?.hiringPreferences?.defaultVisibility ?? "public",
    workType: emp?.hiringPreferences?.workType ?? "",
    preferredLocations: emp?.hiringPreferences?.preferredLocations?.join(", ") ?? "",
    emailNewApplicant: emp?.notificationPrefs?.emailNewApplicant ?? true,
    emailInterviewScheduled: emp?.notificationPrefs?.emailInterviewScheduled ?? true,
    emailOfferResponse: emp?.notificationPrefs?.emailOfferResponse ?? true,
    emailWeeklyDigest: emp?.notificationPrefs?.emailWeeklyDigest ?? true,
    inAppAll: emp?.notificationPrefs?.inAppAll ?? true,
  };
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border/50 bg-card shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description }: { icon: typeof Building2; title: string; description?: string }) {
  return (
    <div className="px-6 py-4 border-b border-border/40">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-[13px] font-medium text-foreground/80 mb-1.5 block">
      {children}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  );
}

function NotificationRow({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: typeof Bell;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3.5 px-4 rounded-lg hover:bg-muted/30 transition-colors gap-4">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/60 mt-0.5 shrink-0">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function CompanySettingsPageWrapper() {
  return (
    <Suspense fallback={null}>
      <CompanySettingsPage />
    </Suspense>
  );
}

function CompanySettingsPage() {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [highlightField, setHighlightField] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>(buildInitialForm());
  const initialFormRef = useRef<FormData>(buildInitialForm());
  const [hasChanges, setHasChanges] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [docError, setDocError] = useState("");
  const docInputRef = useRef<HTMLInputElement>(null);

  // React Query hooks
  const { data: company, isLoading: loading } = useEmployerProfile();
  const updateProfile = useUpdateEmployerProfile();
  const uploadDocMutation = useUploadDocument();
  const deleteDocMutation = useDeleteDocument();
  const saving = updateProfile.isPending;

  // Populate form when company data changes
  useEffect(() => {
    if (company) {
      const initial = buildInitialForm(company);
      setForm(initial);
      initialFormRef.current = initial;
    }
  }, [company]);

  useEffect(() => {
    document.title = "Company Settings · MPLOYEDIN";
  }, []);

  const uploadDoc = async (file: File) => {
    setDocError("");
    try {
      await uploadDocMutation.mutateAsync(file);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const removeDoc = async (url: string) => {
    await deleteDocMutation.mutateAsync(url);
  };

  // Handle query params from setup guide navigation (?tab=contact&highlight=website)
  useEffect(() => {
    const tab = searchParams.get("tab") as TabKey | null;
    const highlight = searchParams.get("highlight");
    if (tab && ["profile", "contact", "hiring", "notifications", "account"].includes(tab)) {
      setActiveTab(tab);
    }
    if (highlight) {
      setHighlightField(highlight);
      // Scroll to and flash the highlighted field after a short delay
      const timer = setTimeout(() => {
        const el = document.querySelector(`[data-field="${highlight}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-2", "ring-primary", "ring-offset-2", "rounded-lg");
          setTimeout(() => {
            el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "rounded-lg");
            setHighlightField(null);
          }, 3000);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  useEffect(() => {
    setHasChanges(JSON.stringify(form) !== JSON.stringify(initialFormRef.current));
  }, [form]);

  const profileCompletion = useMemo(() => {
    if (!company) return 0;
    const checks = [
      !!company.companyName,
      !!company.companyEmail,
      !!company.phone,
      !!company.logo,
      !!company.industry,
      !!company.companySize,
      !!company.description,
      !!company.website,
      !!(company.socialLinks?.linkedin || company.socialLinks?.twitter),
      !!company.address,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [company]);

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Ensure URL fields have a protocol so Zod's url() validator accepts them
  function normalizeUrl(val: string): string {
    if (!val) return val;
    return /^https?:\/\//i.test(val) ? val : `https://${val}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.companyName || !form.companyEmail || !form.phone) {
      setError("Company name, email, and phone are required.");
      return;
    }

    setError("");
    setSuccess("");

    const payload: Record<string, unknown> = {
      companyName: form.companyName,
      companyEmail: form.companyEmail,
      phone: form.phone,
      designation: form.designation,
      address: form.address,
      website: form.website ? normalizeUrl(form.website) : "",
      industry: form.industry,
      companySize: form.companySize,
      description: form.description,
      foundedYear: form.foundedYear ? Number(form.foundedYear) : undefined,
      socialLinks: {
        linkedin: form.linkedin ? normalizeUrl(form.linkedin) : undefined,
        twitter: form.twitter ? normalizeUrl(form.twitter) : undefined,
        facebook: form.facebook ? normalizeUrl(form.facebook) : undefined,
        instagram: form.instagram ? normalizeUrl(form.instagram) : undefined,
      },
      hiringPreferences: {
        defaultVisibility: form.defaultVisibility,
        workType: form.workType || undefined,
        preferredLocations: form.preferredLocations
          ? form.preferredLocations.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
      },
      notificationPrefs: {
        emailNewApplicant: form.emailNewApplicant,
        emailInterviewScheduled: form.emailInterviewScheduled,
        emailOfferResponse: form.emailOfferResponse,
        emailWeeklyDigest: form.emailWeeklyDigest,
        inAppAll: form.inAppAll,
      },
    };

    try {
      const emp = await updateProfile.mutateAsync(payload);
      const newInitial = buildInitialForm(emp);
      initialFormRef.current = newInitial;
      setForm(newInitial);
      setSuccess("Settings saved successfully.");
      setTimeout(() => setSuccess(""), 4000);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update settings.");
    }
  }

  // ── Loading Skeleton ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-container">
        <div className="space-y-3">
          <div className="h-7 w-48 bg-muted animate-pulse rounded-lg" />
          <div className="h-4 w-72 bg-muted/50 animate-pulse rounded" />
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-6 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-muted" />
            <div className="space-y-2 flex-1">
              <div className="h-5 w-40 bg-muted rounded" />
              <div className="h-3 w-28 bg-muted/50 rounded" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-muted/40 animate-pulse rounded-lg" />
            ))}
          </div>
          <div className="space-y-4">
            <div className="h-64 bg-muted/30 animate-pulse rounded-xl" />
            <div className="h-48 bg-muted/30 animate-pulse rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const vBadge = VERIFICATION_BADGES[company?.verificationLevel ?? "basic"];
  const VBadgeIcon = vBadge.icon;
  const memberSince = company?.createdAt
    ? new Date(company.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "";
  const initials = company?.companyName
    ? company.companyName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "CO";

  return (
    <div className={`page-container${hasChanges ? " pb-20" : ""}`}>
      {ConfirmDialogNode}
      {/* ── Page Title ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Company Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your company profile, preferences, and notifications
        </p>
      </div>

      {/* ── Hero Identity Card ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/50 bg-gradient-to-br from-card via-card to-primary/[0.02] shadow-sm overflow-hidden">
        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            {/* Avatar */}
            <div className="relative shrink-0">
              {company?.logo ? (
                <img
                  src={company.logo}
                  alt={company.companyName}
                  className="w-[72px] h-[72px] rounded-2xl object-cover border-2 border-border/30 shadow-sm"
                />
              ) : (
                <div className="w-[72px] h-[72px] rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border-2 border-primary/10 flex items-center justify-center shadow-sm">
                  <span className="text-xl font-bold text-primary/70">{initials}</span>
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-background border-2 border-border/40 flex items-center justify-center">
                <VBadgeIcon className="w-3 h-3 text-primary" />
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-semibold truncate">{company?.companyName}</h2>
                <Badge variant="outline" className={`${vBadge.color} text-[11px] font-medium px-2 py-0.5 border inline-flex items-center leading-none`}>
                  <VBadgeIcon className="w-3 h-3 me-1 shrink-0" />
                  <span>{vBadge.label}</span>
                </Badge>
                {company?.subscriptionType && (
                  <Badge variant="outline" className="text-[11px] font-medium capitalize px-2 py-0.5 inline-flex items-center leading-none">
                    <span>{company.subscriptionType} Plan</span>
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                {company?.industry && (
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    {company.industry}
                  </span>
                )}
                {company?.companySize && (
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {company.companySize} employees
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Member since {memberSince}
                </span>
                {company?.verificationDocs && company.verificationDocs.length > 0 && (
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {company.verificationDocs.length} doc(s)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Profile Completion */}
          <div className="mt-5 pt-4 border-t border-border/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Profile Completion</span>
              <span className={`text-xs font-semibold ${profileCompletion === 100 ? "text-emerald-600" : "text-primary"}`}>
                {profileCompletion}%
              </span>
            </div>
            <Progress value={profileCompletion} className="h-1.5" />
            {profileCompletion < 100 && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Complete your profile to build trust with candidates and improve your listing visibility.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Toast Messages ─────────────────────────────────────────────── */}
      {success && (
        <div className="flex items-center gap-3 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 animate-in slide-in-from-top-2 fade-in duration-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium text-emerald-700">{success}</p>
          <button onClick={() => setSuccess("")} className="ml-auto text-emerald-400 hover:text-emerald-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 p-3.5 rounded-lg bg-destructive/10 border border-destructive/20 animate-in slide-in-from-top-2 fade-in duration-300">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-sm font-medium text-destructive">{error}</p>
          <button onClick={() => setError("")} className="ml-auto text-destructive/40 hover:text-destructive">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Sidebar + Content Layout ───────────────────────────────────── */}
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">

          {/* ── Left Navigation ────────────────────────────────────────── */}
          <nav className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-1.5 lg:mx-0 lg:sticky lg:top-4 lg:self-start">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveTab(item.key)}
                  className={`
                    flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all duration-150
                    whitespace-nowrap lg:whitespace-normal min-w-[140px] lg:min-w-0 group
                    ${isActive
                      ? "bg-primary/[0.08] text-primary shadow-sm border border-primary/15"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                    }
                  `}
                >
                  <div className={`
                    flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors
                    ${isActive ? "bg-primary/15" : "bg-muted/60 group-hover:bg-muted"}
                  `}>
                    <Icon className={`w-4 h-4 ${isActive ? "text-primary" : ""}`} />
                  </div>
                  <div className="hidden lg:block flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? "text-primary" : ""}`}>{item.label}</p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{item.desc}</p>
                  </div>
                  <span className="hidden lg:block text-xs text-muted-foreground ml-auto">
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isActive ? "text-primary" : ""}`} />
                  </span>
                  <span className="lg:hidden text-xs font-medium">{item.label.split(" ")[0]}</span>
                </button>
              );
            })}
          </nav>

          {/* ── Right Content ──────────────────────────────────────────── */}
          <div className="space-y-5 min-w-0">

            {/* ── Profile Tab ──────────────────────────────────────────── */}
            {activeTab === "profile" && (
              <>
                {/* Logo Upload */}
                <SectionCard>
                  <SectionHeader icon={Camera} title="Company Logo" description="Upload your company logo. Shown on job listings and your profile." />
                  <div className="p-6">
                    <LogoUpload
                      currentLogo={company?.logo}
                      companyName={form.companyName}
                      onUploadComplete={(url) => {
                        // React Query will automatically refetch after mutation
                        router.refresh();
                      }}
                      onRemove={() => {
                        // React Query will automatically refetch after mutation
                        router.refresh();
                      }}
                    />
                  </div>
                </SectionCard>

                {/* Basic info */}
                <SectionCard>
                  <SectionHeader icon={Building2} title="Company Information" description="Basic details about your organization" />
                  <div className="p-6 space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div data-field="companyName" className="transition-all duration-300">
                        <FieldLabel required>Company Name</FieldLabel>
                        <Input
                          value={form.companyName}
                          onChange={(e) => setField("companyName", e.target.value)}
                          placeholder="Your company name"
                          required
                        />
                      </div>
                      <div data-field="industry" className="transition-all duration-300">
                        <FieldLabel>Industry</FieldLabel>
                        <SearchableSelect
                          options={INDUSTRIES.map((i) => ({ value: i, label: i }))}
                          value={form.industry}
                          onValueChange={(v) => setField("industry", v)}
                          placeholder="Select industry"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                      <div>
                        <FieldLabel>Company Size</FieldLabel>
                        <SearchableSelect
                          options={COMPANY_SIZES.map((s) => ({ value: s, label: `${s} employees` }))}
                          value={form.companySize}
                          onValueChange={(v) => setField("companySize", v)}
                          placeholder="Select size"
                        />
                      </div>
                      <div>
                        <FieldLabel>Founded Year</FieldLabel>
                        <Input
                          type="number"
                          placeholder="e.g. 2015"
                          min={1800}
                          max={new Date().getFullYear()}
                          value={form.foundedYear}
                          onChange={(e) => setField("foundedYear", e.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel>Your Title / Designation</FieldLabel>
                        <Input
                          placeholder="e.g. HR Manager"
                          value={form.designation}
                          onChange={(e) => setField("designation", e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <FieldLabel>Address</FieldLabel>
                      <Input
                        placeholder="Company address"
                        value={form.address}
                        onChange={(e) => setField("address", e.target.value)}
                      />
                    </div>

                    <Separator />

                    <div>
                      <FieldLabel>About the Company</FieldLabel>
                      <Textarea
                        placeholder="Tell candidates about your company culture, mission, and what makes you a great place to work..."
                        value={form.description}
                        onChange={(e) => setField("description", e.target.value)}
                        maxLength={2000}
                        className="min-h-[140px] resize-y"
                      />
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-[11px] text-muted-foreground">
                          This appears on your public company profile and job listings.
                        </p>
                        <p className={`text-[11px] font-medium ${form.description.length > 1800 ? "text-amber-600" : "text-muted-foreground"}`}>
                          {form.description.length}/2,000
                        </p>
                      </div>
                    </div>
                  </div>
                </SectionCard>
              </>
            )}

            {/* ── Contact & Social Tab ─────────────────────────────────── */}
            {activeTab === "contact" && (
              <>
                <SectionCard>
                  <SectionHeader icon={Mail} title="Contact Details" description="Primary contact information for your company" />
                  <div className="p-6 space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div data-field="companyEmail" className="transition-all duration-300">
                        <FieldLabel required>Company Email</FieldLabel>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                          <Input
                            type="email"
                            className="pl-10"
                            value={form.companyEmail}
                            onChange={(e) => setField("companyEmail", e.target.value)}
                            placeholder="contact@company.com"
                            required
                          />
                        </div>
                      </div>
                      <div data-field="phone" className="transition-all duration-300">
                        <FieldLabel required>Phone</FieldLabel>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                          <Input
                            type="tel"
                            className="pl-10"
                            value={form.phone}
                            onChange={(e) => setField("phone", e.target.value)}
                            placeholder="+971 50 000 0000"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div data-field="website" className="transition-all duration-300">
                      <FieldLabel>Website</FieldLabel>
                      <div className="relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                        <Input
                          type="text"
                          className="pl-10"
                          placeholder="https://yourcompany.com"
                          value={form.website}
                          onChange={(e) => setField("website", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard>
                  <SectionHeader icon={Link2} title="Social Media" description="Links shown on your public company profile" />
                  <div className="p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <FieldLabel>LinkedIn</FieldLabel>
                        <div className="relative">
                          <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0077B5]" />
                          <Input
                            type="text"
                            className="pl-10"
                            placeholder="https://linkedin.com/company/..."
                            value={form.linkedin}
                            onChange={(e) => setField("linkedin", e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <FieldLabel>Twitter / X</FieldLabel>
                        <div className="relative">
                          <Twitter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1DA1F2]" />
                          <Input
                            type="text"
                            className="pl-10"
                            placeholder="https://twitter.com/..."
                            value={form.twitter}
                            onChange={(e) => setField("twitter", e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <FieldLabel>Facebook</FieldLabel>
                        <div className="relative">
                          <Facebook className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1877F2]" />
                          <Input
                            type="text"
                            className="pl-10"
                            placeholder="https://facebook.com/..."
                            value={form.facebook}
                            onChange={(e) => setField("facebook", e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <FieldLabel>Instagram</FieldLabel>
                        <div className="relative">
                          <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#E4405F]" />
                          <Input
                            type="text"
                            className="pl-10"
                            placeholder="https://instagram.com/..."
                            value={form.instagram}
                            onChange={(e) => setField("instagram", e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </SectionCard>
              </>
            )}

            {/* ── Hiring Preferences Tab ───────────────────────────────── */}
            {activeTab === "hiring" && (
              <SectionCard>
                <SectionHeader icon={Briefcase} title="Hiring Preferences" description="Default settings for new job postings — can be overridden per job" />
                <div className="p-6 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <FieldLabel>Default Job Visibility</FieldLabel>
                      <SearchableSelect
                        options={[
                          { value: "public", label: "Public \u2014 Visible on job board" },
                          { value: "private", label: "Private \u2014 Invite only" },
                        ]}
                        value={form.defaultVisibility}
                        onValueChange={(v) => setField("defaultVisibility", v)}
                      />
                    </div>
                    <div>
                      <FieldLabel>Preferred Work Type</FieldLabel>
                      <SearchableSelect
                        options={WORK_TYPES.map((w) => ({ value: w.value, label: w.label }))}
                        value={form.workType}
                        onValueChange={(v) => setField("workType", v)}
                        placeholder="Select work type"
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel>Preferred Hiring Locations</FieldLabel>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                      <Input
                        className="pl-10"
                        placeholder="e.g. Dubai, Riyadh, Cairo"
                        value={form.preferredLocations}
                        onChange={(e) => setField("preferredLocations", e.target.value)}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Comma-separated list of cities or regions where you typically hire.
                    </p>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* ── Notifications Tab ────────────────────────────────────── */}
            {activeTab === "notifications" && (
              <>
                <SectionCard>
                  <SectionHeader icon={Mail} title="Email Notifications" description="Choose which events send you email notifications" />
                  <div className="p-2">
                    <NotificationRow
                      icon={Users}
                      label="New Applicant"
                      description="When a candidate applies to one of your jobs"
                      checked={form.emailNewApplicant}
                      onChange={(v) => setField("emailNewApplicant", v)}
                    />
                    <NotificationRow
                      icon={Calendar}
                      label="Interview Scheduled"
                      description="When an interview is confirmed or rescheduled"
                      checked={form.emailInterviewScheduled}
                      onChange={(v) => setField("emailInterviewScheduled", v)}
                    />
                    <NotificationRow
                      icon={FileText}
                      label="Offer Response"
                      description="When a candidate accepts, rejects, or negotiates an offer"
                      checked={form.emailOfferResponse}
                      onChange={(v) => setField("emailOfferResponse", v)}
                    />
                    <NotificationRow
                      icon={Briefcase}
                      label="Weekly Digest"
                      description="Summary of pipeline activity and pending actions"
                      checked={form.emailWeeklyDigest}
                      onChange={(v) => setField("emailWeeklyDigest", v)}
                    />
                  </div>
                </SectionCard>

                <SectionCard>
                  <SectionHeader icon={Bell} title="In-App Notifications" description="Control notifications shown in the bell menu" />
                  <div className="p-2">
                    <NotificationRow
                      icon={Bell}
                      label="All In-App Notifications"
                      description="Show real-time notifications in the bell icon menu"
                      checked={form.inAppAll}
                      onChange={(v) => setField("inAppAll", v)}
                    />
                  </div>
                </SectionCard>
              </>
            )}

            {/* ── Account Tab ──────────────────────────────────────────── */}
            {activeTab === "account" && (
              <>
                <SectionCard>
                  <SectionHeader icon={Shield} title="Verification & Trust" description="Your verification status and trust level" />
                  <div className="p-6 space-y-4">
                    <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/30 border border-border/30">
                      <div className={`flex items-center justify-center w-10 h-10 rounded-xl shrink-0 ${
                        company?.verificationLevel === "basic" ? "bg-slate-100" : "bg-emerald-50"
                      }`}>
                        <VBadgeIcon className={`w-5 h-5 ${
                          company?.verificationLevel === "basic" ? "text-slate-500" : "text-emerald-600"
                        }`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`${vBadge.color} text-[11px] font-medium px-2 py-0.5 border`}>
                            {vBadge.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1.5">
                          {company?.verificationLevel === "basic"
                            ? "Upload company documents to get verified and build trust with candidates."
                            : "Your company is verified. Candidates see a trust badge on your job postings."}
                        </p>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-[11px] text-muted-foreground">Member Since</p>
                          <p className="text-sm font-medium">{memberSince}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
                        <Briefcase className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-[11px] text-muted-foreground">Current Plan</p>
                          <p className="text-sm font-medium capitalize">
                            {company?.subscriptionType ?? "Free"}
                          </p>
                        </div>
                      </div>
                      {company?.verificationDocs && company.verificationDocs.length > 0 && (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-[11px] text-muted-foreground">Documents</p>
                            <p className="text-sm font-medium">{company.verificationDocs.length} uploaded</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </SectionCard>

                {/* Document Upload */}
                <SectionCard>
                  <SectionHeader icon={FileText} title="Verification Documents" description="Upload documents to verify your company (PDF, images, DOCX — max 10MB each)" />
                  <div className="p-6 space-y-4">
                    {docError && (
                      <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{docError}</p>
                    )}
                    <div className="space-y-2">
                      {(company?.verificationDocs ?? []).map((url) => {
                        const name = url.split("/").pop() ?? url;
                        return (
                          <div key={url} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/40 bg-muted/20">
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline truncate flex-1">{name}</a>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="shrink-0 h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => removeDoc(url)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                    <input
                      ref={docInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadDoc(file);
                        e.target.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadDocMutation.isPending || (company?.verificationDocs?.length ?? 0) >= 10}
                      onClick={() => docInputRef.current?.click()}
                    >
                      <Upload className="w-3.5 h-3.5 me-1.5" />
                      {uploadDocMutation.isPending ? "Uploading…" : "Upload Document"}
                    </Button>
                    {(company?.verificationDocs?.length ?? 0) >= 10 && (
                      <p className="text-xs text-muted-foreground">Maximum 10 documents reached.</p>
                    )}
                  </div>
                </SectionCard>

                {/* Danger Zone */}
                <div className="rounded-xl border-2 border-dashed border-destructive/25 bg-destructive/[0.02] p-6 space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-destructive/10">
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Irreversible or significant account actions
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/15 bg-background">
                    <div>
                      <p className="text-sm font-medium">Deactivate Account</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Hides your profile and unpublishes all jobs. Reversible via support.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-destructive/40 text-destructive hover:bg-destructive hover:text-white shrink-0 ml-4"
                      disabled={deactivating}
                      onClick={async () => {
                        const ok = await confirmDialog("Are you sure you want to deactivate your account? All active jobs will be unpublished.");
                        if (!ok) return;
                        setDeactivating(true);
                        fetch("/api/employers/me", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ workflowMode: "manual" }),
                        }).finally(() => setDeactivating(false));
                      }}
                    >
                      {deactivating ? "Processing…" : "Deactivate"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Sticky Save Bar ──────────────────────────────────────────── */}
        <div
          className={`
            fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ease-out
            ${hasChanges ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"}
          `}
        >
          <div className="bg-background/80 backdrop-blur-xl border-t border-border/60 shadow-[0_-8px_30px_-4px_rgb(0_0_0/0.1)]">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 text-sm">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-muted-foreground font-medium">Unsaved changes</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    setForm(initialFormRef.current);
                    setError("");
                    setSuccess("");
                  }}
                >
                  Discard
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="px-6 shadow-sm">
                  <Save className="w-4 h-4 me-2" />
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
