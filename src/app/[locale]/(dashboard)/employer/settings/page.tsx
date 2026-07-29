"use client";

import { Suspense, useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Save, Building2, Globe, Phone, Mail, Shield, FileText,
  Briefcase, Bell, AlertTriangle, Linkedin, Twitter, Facebook, Instagram,
  MapPin, Calendar, Users, Eye, EyeOff, Link2, CheckCircle2, Clock, Sparkles,
  ChevronRight, Camera, X, Upload, Trash2, Send,
} from "lucide-react";
import { toast } from "sonner";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { PageHero } from "@/components/shared/PageHero";
import { LogoUpload } from "@/components/features/employer/LogoUpload";
import { ChangeEmailCard } from "@/components/features/settings/ChangeEmailCard";
import { CalendarFeedCard } from "@/components/features/settings/CalendarFeedCard";
import { useConfirm } from "@/hooks/useConfirm";
import { useEmployerProfile, useUpdateEmployerProfile, useUploadDocument, useDeleteDocument } from "@/hooks/useEmployerProfile";
import type { CompanyData } from "@/hooks/useEmployerProfile";
import { useCountrySearch } from "@/hooks/useCountrySearch";
import { useTranslations } from "next-intl";

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  { key: "profile", label: "companyProfile", desc: "companyProfileDesc", icon: Building2 },
  { key: "contact", label: "contactSocial", desc: "contactSocialDesc", icon: Link2 },
  { key: "hiring", label: "hiringPreferences", desc: "hiringPreferencesDesc", icon: Briefcase },
  { key: "notifications", label: "notifications", desc: "notificationsDesc", icon: Bell },
  { key: "account", label: "accountSecurity", desc: "accountSecurityDesc", icon: Shield },
];

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface FormData {
  companyName: string;
  description: string;
  industry: string;
  companySize: string;
  foundedYear: string;
  designation: string;
  registrationNo: string;
  taxId: string;
  address: string;
  country: string;
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
    registrationNo: emp?.registrationNo ?? "",
    taxId: emp?.taxId ?? "",
    address: emp?.address ?? "",
    country: emp?.country ?? "",
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

// â”€â”€â”€ Sub-Components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Page Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function CompanySettingsPageWrapper() {
  return (
    <Suspense fallback={null}>
      <CompanySettingsPage />
    </Suspense>
  );
}

function CompanySettingsPage() {
  const { locale } = useParams<{ locale: string }>();
  const { data: session } = useSession();
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
  const { data: countries = [] } = useCountrySearch("", { loadAll: true });
  const updateProfile = useUpdateEmployerProfile();
  const uploadDocMutation = useUploadDocument();
  const deleteDocMutation = useDeleteDocument();
  const saving = updateProfile.isPending;
  const t = useTranslations("employerSettings");
  const tc = useTranslations("employerCommon");

  // Populate form when company data changes
  useEffect(() => {
    if (company) {
      const initial = buildInitialForm(company);
      setForm(initial);
      initialFormRef.current = initial;
    }
  }, [company]);

  useEffect(() => {
    document.title = t("documentTitle");
  }, [t]);

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
      registrationNo: form.registrationNo || undefined,
      taxId: form.taxId || undefined,
      address: form.address,
      country: form.country || undefined,
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

  // â”€â”€ Loading Skeleton â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          <div className="space-y-3 sm:space-y-4">
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
    ? new Date(company.createdAt).toLocaleDateString(locale === "ar" ? "ar" : "en-US", { month: "long", year: "numeric" })
    : "";
  const initials = company?.companyName
    ? company.companyName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "CO";

  return (
    <div className={`page-container${hasChanges ? " pb-20" : ""}`}>
      {ConfirmDialogNode}
      {/* â”€â”€ Page Title â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <PageHero icon={Building2} title={t("title")} description={t("description")} />

      {/* â”€â”€ Hero Identity Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                    <span>{company.subscriptionType} {t("plan")}</span>
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
                    {company.companySize} {t("employees")}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {t("memberSince")} {memberSince}
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
              <span className="text-xs font-medium text-muted-foreground">{t("profileCompletion")}</span>
              <span className={`text-xs font-semibold ${profileCompletion === 100 ? "text-emerald-600" : "text-primary"}`}>
                {profileCompletion}%
              </span>
            </div>
            <Progress value={profileCompletion} className="h-1.5" />
            {profileCompletion < 100 && (
              <p className="text-[11px] text-muted-foreground mt-2">
                {t("profileCompletionDesc")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* â”€â”€ Toast Messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

      {/* â”€â”€ Sidebar + Content Layout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">

          {/* â”€â”€ Left Navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                    <p className={`text-sm font-medium truncate ${isActive ? "text-primary" : ""}`}>{t(item.label)}</p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{t(item.desc)}</p>
                  </div>
                  <span className="hidden lg:block text-xs text-muted-foreground ml-auto">
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isActive ? "text-primary" : ""}`} />
                  </span>
                  <span className="lg:hidden text-xs font-medium">{t(item.label).split(" ")[0]}</span>
                </button>
              );
            })}
          </nav>

          {/* â”€â”€ Right Content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="space-y-3 sm:space-y-5 min-w-0">

            {/* â”€â”€ Profile Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {activeTab === "profile" && (
              <>
                {/* Logo Upload */}
                <SectionCard>
                  <SectionHeader icon={Camera} title={t("companyLogo")} description={t("companyLogoDesc")} />
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
                  <SectionHeader icon={Building2} title={t("companyInfo")} description={t("companyInfoDesc")} />
                  <div className="p-6 space-y-3 sm:space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div data-field="companyName" className="transition-all duration-300">
                        <FieldLabel required>{t("companyName")}</FieldLabel>
                        <Input
                          value={form.companyName}
                          onChange={(e) => setField("companyName", e.target.value)}
                          placeholder={t("companyNamePlaceholder")}
                          required
                        />
                      </div>
                      <div data-field="industry" className="transition-all duration-300">
                        <FieldLabel>{t("industry")}</FieldLabel>
                        <SearchableSelect
                          options={INDUSTRIES.map((i) => ({ value: i, label: i }))}
                          value={form.industry}
                          onValueChange={(v) => setField("industry", v)}
                          placeholder={t("selectIndustry")}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                      <div>
                        <FieldLabel>{t("companySize")}</FieldLabel>
                        <SearchableSelect
                          options={COMPANY_SIZES.map((s) => ({ value: s, label: `${s} employees` }))}
                          value={form.companySize}
                          onValueChange={(v) => setField("companySize", v)}
                          placeholder={t("selectSize")}
                        />
                      </div>
                      <div>
                        <FieldLabel>{t("foundedYear")}</FieldLabel>
                        <Input
                          type="number"
                          placeholder={t("foundedYearPlaceholder")}
                          min={1800}
                          max={new Date().getFullYear()}
                          value={form.foundedYear}
                          onChange={(e) => setField("foundedYear", e.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel>{t("yourTitle")}</FieldLabel>
                        <Input
                          placeholder={t("yourTitlePlaceholder")}
                          value={form.designation}
                          onChange={(e) => setField("designation", e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <FieldLabel>{t("address")}</FieldLabel>
                        <Input
                          placeholder={t("addressPlaceholder")}
                          value={form.address}
                          onChange={(e) => setField("address", e.target.value)}
                        />
                      </div>
                      <div data-field="country" className="transition-all duration-300">
                        <FieldLabel>{t("country")}</FieldLabel>
                        <SearchableSelect
                          options={countries.map((c) => ({ value: c.code, label: `${c.name} (${c.currencyCode})` }))}
                          value={form.country}
                          onValueChange={(v) => setField("country", v)}
                          placeholder={t("selectCountry")}
                          searchPlaceholder={t("searchCountries")}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <FieldLabel>{t("registrationNo")}</FieldLabel>
                        <Input
                          placeholder={t("registrationNoPlaceholder")}
                          value={form.registrationNo}
                          onChange={(e) => setField("registrationNo", e.target.value)}
                        />
                      </div>
                      <div>
                        <FieldLabel>{t("taxId")}</FieldLabel>
                        <Input
                          placeholder={t("taxIdPlaceholder")}
                          value={form.taxId}
                          onChange={(e) => setField("taxId", e.target.value)}
                        />
                        <p className="mt-1 text-[10px] text-muted-foreground">{t("taxIdHint")}</p>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <FieldLabel>{t("aboutCompany")}</FieldLabel>
                      <Textarea
                        placeholder={t("aboutCompanyPlaceholder")}
                        value={form.description}
                        onChange={(e) => setField("description", e.target.value)}
                        maxLength={2000}
                        className="min-h-[140px] resize-y"
                      />
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-[11px] text-muted-foreground">
                          {t("aboutCompanyHint")}
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

            {/* â”€â”€ Contact & Social Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {activeTab === "contact" && (
              <>
                <SectionCard>
                  <SectionHeader icon={Mail} title={t("contactDetails")} description={t("contactDetailsDesc")} />
                  <div className="p-6 space-y-3 sm:space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div data-field="companyEmail" className="transition-all duration-300">
                        <FieldLabel required>{t("companyEmail")}</FieldLabel>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                          <Input
                            type="email"
                            className="pl-10"
                            value={form.companyEmail}
                            onChange={(e) => setField("companyEmail", e.target.value)}
                            placeholder={t("companyEmailPlaceholder")}
                            required
                          />
                        </div>
                      </div>
                      <div data-field="phone" className="transition-all duration-300">
                        <FieldLabel required>{t("phone")}</FieldLabel>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                          <Input
                            type="tel"
                            className="pl-10"
                            value={form.phone}
                            onChange={(e) => setField("phone", e.target.value)}
                            placeholder={t("phonePlaceholder")}
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div data-field="website" className="transition-all duration-300">
                      <FieldLabel>{t("website")}</FieldLabel>
                      <div className="relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                        <Input
                          type="text"
                          className="pl-10"
                          placeholder={t("websitePlaceholder")}
                          value={form.website}
                          onChange={(e) => setField("website", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard>
                  <SectionHeader icon={Link2} title={t("socialMedia")} description={t("socialMediaDesc")} />
                  <div className="p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <FieldLabel>{t("linkedin")}</FieldLabel>
                        <div className="relative">
                          <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0077B5]" />
                          <Input
                            type="text"
                            className="pl-10"
                            placeholder={t("linkedinPlaceholder")}
                            value={form.linkedin}
                            onChange={(e) => setField("linkedin", e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <FieldLabel>{t("twitter")}</FieldLabel>
                        <div className="relative">
                          <Twitter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1DA1F2]" />
                          <Input
                            type="text"
                            className="pl-10"
                            placeholder={t("twitterPlaceholder")}
                            value={form.twitter}
                            onChange={(e) => setField("twitter", e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <FieldLabel>{t("facebook")}</FieldLabel>
                        <div className="relative">
                          <Facebook className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1877F2]" />
                          <Input
                            type="text"
                            className="pl-10"
                            placeholder={t("facebookPlaceholder")}
                            value={form.facebook}
                            onChange={(e) => setField("facebook", e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <FieldLabel>{t("instagram")}</FieldLabel>
                        <div className="relative">
                          <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#E4405F]" />
                          <Input
                            type="text"
                            className="pl-10"
                            placeholder={t("instagramPlaceholder")}
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

            {/* â”€â”€ Hiring Preferences Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {activeTab === "hiring" && (
              <SectionCard>
                <SectionHeader icon={Briefcase} title={t("hiringPreferences")} description={t("hiringPrefsSectionDesc")} />
                <div className="p-6 space-y-3 sm:space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <FieldLabel>{t("defaultJobVisibility")}</FieldLabel>
                      <SearchableSelect
                        options={[
                          { value: "public", label: t("visibilityPublic") },
                          { value: "private", label: t("visibilityPrivate") },
                        ]}
                        value={form.defaultVisibility}
                        onValueChange={(v) => setField("defaultVisibility", v)}
                      />
                    </div>
                    <div>
                      <FieldLabel>{t("preferredWorkType")}</FieldLabel>
                      <SearchableSelect
                        options={WORK_TYPES.map((w) => ({ value: w.value, label: w.label }))}
                        value={form.workType}
                        onValueChange={(v) => setField("workType", v)}
                        placeholder={t("selectWorkType")}
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel>{t("preferredHiringLocations")}</FieldLabel>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                      <Input
                        className="pl-10"
                        placeholder={t("preferredLocationsPlaceholder")}
                        value={form.preferredLocations}
                        onChange={(e) => setField("preferredLocations", e.target.value)}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      {t("preferredLocationsHint")}
                    </p>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* â”€â”€ Notifications Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {activeTab === "notifications" && (
              <EmployerNotificationsTab />
            )}

            {/* â”€â”€ Account Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {activeTab === "account" && (
              <>
                <SectionCard>
                  <SectionHeader icon={Shield} title={t("verificationTrust")} description={t("verificationTrustDesc")} />
                  <div className="p-6 space-y-3 sm:space-y-4">
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
                            ? t("verifyUploadPrompt")
                            : t("verifiedTrustNote")}
                        </p>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-[11px] text-muted-foreground">{t("memberSince")}</p>
                          <p className="text-sm font-medium">{memberSince}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
                        <Briefcase className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-[11px] text-muted-foreground">{t("currentPlan")}</p>
                          <p className="text-sm font-medium capitalize">
                            {company?.subscriptionType ?? t("freePlan")}
                          </p>
                        </div>
                      </div>
                      {company?.verificationDocs && company.verificationDocs.length > 0 && (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-[11px] text-muted-foreground">{t("documents")}</p>
                            <p className="text-sm font-medium">{t("documentsUploaded", { count: company.verificationDocs.length })}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </SectionCard>

                {/* Document Upload */}
                <SectionCard>
                  <SectionHeader icon={FileText} title={t("verificationDocuments")} description={t("verificationDocumentsDesc")} />
                  <div className="p-6 space-y-3 sm:space-y-4">
                    <p className="text-xs text-muted-foreground bg-muted/30 border border-border/30 rounded-lg px-3 py-2 leading-relaxed">
                      {t("verificationProcessNote")}
                    </p>
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
                      {uploadDocMutation.isPending ? t("uploading") : t("uploadDocument")}
                    </Button>
                    {(company?.verificationDocs?.length ?? 0) >= 10 && (
                      <p className="text-xs text-muted-foreground">{t("maxDocumentsReached")}</p>
                    )}
                  </div>
                </SectionCard>

                {/* SMTP Override (Premium) */}
                <EmployerSmtpOverride isPremium={company?.subscriptionType === "premium"} />

                {/* Email change */}
                <ChangeEmailCard />
            <CalendarFeedCard />

                {/* Danger Zone */}
                <div className="rounded-xl border-2 border-dashed border-destructive/25 bg-destructive/[0.02] p-6 space-y-3 sm:space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-destructive/10">
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-destructive">{t("dangerZone")}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("dangerZoneDesc")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/15 bg-background">
                    <div>
                      <p className="text-sm font-medium">{t("deactivateAccount")}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("deactivateAccountDesc")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-destructive/40 text-destructive hover:bg-destructive hover:text-white shrink-0 ms-4"
                      disabled={deactivating}
                      onClick={async () => {
                        const ok = await confirmDialog({ message: t("deactivateConfirm"), variant: "destructive" });
                        if (!ok) return;
                        const userId = (session?.user as { id?: string } | undefined)?.id;
                        if (!userId) { toast.error(t("deactivateFailed")); return; }
                        setDeactivating(true);
                        try {
                          const res = await fetch(`/api/employers/${userId}`, { method: "DELETE" });
                          if (!res.ok) throw new Error();
                          toast.success(t("deactivateSuccess"));
                          await signOut({ callbackUrl: `/${locale}/login` });
                        } catch {
                          toast.error(t("deactivateFailed"));
                          setDeactivating(false);
                        }
                      }}
                    >
                      {deactivating ? t("processing") : t("deactivate")}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* â”€â”€ Sticky Save Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                <span className="text-muted-foreground font-medium">{t("unsavedChanges")}</span>
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
                  {t("discard")}
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="px-6 shadow-sm">
                  <Save className="w-4 h-4 me-2" />
                  {saving ? "Savingâ€¦" : t("saveChanges")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

// â”€â”€â”€ Employer Notifications Tab (API-connected) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Channel = "in_app" | "email";
type CategoryKey = "applications" | "interviews" | "offers" | "jobs" | "system";
type EmailFrequency = "instant" | "daily" | "weekly" | "none";

interface CategoryPref { enabled: boolean; channels: Channel[] }

interface NotifPrefs {
  emailFrequency: EmailFrequency;
  categories: Record<CategoryKey, CategoryPref>;
  unsubscribedAll: boolean;
}

const EMPLOYER_CATEGORIES: { key: CategoryKey; icon: typeof Bell; labelKey: string; descKey: string }[] = [
  { key: "applications", icon: Users, labelKey: "catApplications", descKey: "catApplicationsDesc" },
  { key: "interviews", icon: Calendar, labelKey: "catInterviews", descKey: "catInterviewsDesc" },
  { key: "offers", icon: FileText, labelKey: "catOffers", descKey: "catOffersDesc" },
  { key: "jobs", icon: Briefcase, labelKey: "catJobs", descKey: "catJobsDesc" },
  { key: "system", icon: Shield, labelKey: "catSystem", descKey: "catSystemDesc" },
];

const FREQ_OPTIONS: { value: EmailFrequency; labelKey: string; descKey: string }[] = [
  { value: "instant", labelKey: "freqInstant", descKey: "freqInstantDesc" },
  { value: "daily", labelKey: "freqDaily", descKey: "freqDailyDesc" },
  { value: "weekly", labelKey: "freqWeekly", descKey: "freqWeeklyDesc" },
  { value: "none", labelKey: "freqNone", descKey: "freqNoneDesc" },
];

const CH_LABELS: Record<Channel, { labelKey: string; Icon: typeof Bell }> = {
  in_app: { labelKey: "channelInApp", Icon: Bell },
  email: { labelKey: "channelEmail", Icon: Mail },
};

function EmployerNotificationsTab() {
  const t = useTranslations("employerSettings");
  const [prefs, setPrefs] = useState<NotifPrefs>({
    emailFrequency: "daily",
    categories: {
      applications: { enabled: true, channels: ["in_app", "email"] },
      interviews: { enabled: true, channels: ["in_app", "email"] },
      offers: { enabled: true, channels: ["in_app", "email"] },
      jobs: { enabled: true, channels: ["in_app", "email"] },
      system: { enabled: true, channels: ["in_app", "email"] },
    },
    unsubscribedAll: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serverSnap, setServerSnap] = useState("");
  const hasChanges = serverSnap ? JSON.stringify(prefs) !== serverSnap : false;

  useEffect(() => {
    fetch("/api/user/notification-preferences")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          const d = res.data;
          const loaded: NotifPrefs = {
            emailFrequency: d.emailFrequency ?? "daily",
            categories: {
              applications: d.categories?.applications ?? { enabled: true, channels: ["in_app", "email"] },
              interviews: d.categories?.interviews ?? { enabled: true, channels: ["in_app", "email"] },
              offers: d.categories?.offers ?? { enabled: true, channels: ["in_app", "email"] },
              jobs: d.categories?.jobs ?? { enabled: true, channels: ["in_app", "email"] },
              system: d.categories?.system ?? { enabled: true, channels: ["in_app", "email"] },
            },
            unsubscribedAll: d.unsubscribedAll ?? false,
          };
          setPrefs(loaded);
          setServerSnap(JSON.stringify(loaded));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (res.ok) {
        setServerSnap(JSON.stringify(prefs));
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="h-64 animate-pulse rounded-xl bg-muted/30" />;
  }

  return (
    <>
      {/* Frequency selector */}
      <SectionCard>
        <SectionHeader icon={Clock} title={t("emailFrequency")} description={t("emailFrequencyDesc")} />
        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {FREQ_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPrefs((p) => ({ ...p, emailFrequency: opt.value }))}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                prefs.emailFrequency === opt.value
                  ? "border-primary bg-primary/5"
                  : "border-border/50 hover:border-border"
              }`}
            >
              <div className="text-sm font-medium">{t(opt.labelKey)}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{t(opt.descKey)}</div>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* Categories */}
      <SectionCard>
        <SectionHeader icon={Bell} title={t("notificationCategories")} description={t("notificationCategoriesDesc")} />
        <div className="divide-y divide-border/30">
          {EMPLOYER_CATEGORIES.map((cat) => {
            const pref = prefs.categories[cat.key];
            return (
              <div key={cat.key} className="px-4 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/60 mt-0.5 shrink-0">
                      <cat.icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{t(cat.labelKey)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t(cat.descKey)}</p>
                    </div>
                  </div>
                  <Switch
                    checked={pref.enabled}
                    onCheckedChange={() =>
                      setPrefs((p) => ({
                        ...p,
                        categories: {
                          ...p.categories,
                          [cat.key]: { ...pref, enabled: !pref.enabled },
                        },
                      }))
                    }
                  />
                </div>
                {pref.enabled && (
                  <div className="flex items-center gap-2 mt-3 ms-11">
                    {(Object.keys(CH_LABELS) as Channel[]).map((ch) => {
                      const { labelKey, Icon: ChIcon } = CH_LABELS[ch];
                      const active = pref.channels.includes(ch);
                      return (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => {
                            const channels = active
                              ? pref.channels.filter((c) => c !== ch)
                              : [...pref.channels, ch];
                            setPrefs((p) => ({
                              ...p,
                              categories: { ...p.categories, [cat.key]: { ...pref, channels } },
                            }));
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                            active
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border/50 bg-muted/30 text-muted-foreground hover:border-border"
                          }`}
                        >
                          <ChIcon className="w-3 h-3" />
                          {t(labelKey)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleSave} disabled={saving || !hasChanges} size="sm" className="gap-2">
          <Save className="w-4 h-4" />
          {saving ? t("saving") : t("saveNotificationSettings")}
        </Button>
        {saved && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> {t("saved")}
          </span>
        )}
      </div>
    </>
  );
}

// â”€â”€â”€ Employer SMTP Override (Premium Feature) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function EmployerSmtpOverride({ isPremium }: { isPremium: boolean }) {
  const t = useTranslations("employerSettings");
  const [smtp, setSmtp] = useState({
    smtpEmail: "",
    smtpAppPassword: "",
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpSecure: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/employers/me/smtp")
      .then((r) => r.json())
      .then((data) => {
        if (data.smtp) {
          setSmtp({
            smtpEmail: data.smtp.smtpEmail ?? "",
            smtpAppPassword: data.smtp.smtpAppPassword ?? "",
            smtpHost: data.smtp.smtpHost ?? "smtp.gmail.com",
            smtpPort: data.smtp.smtpPort ?? 587,
            smtpSecure: data.smtp.smtpSecure ?? false,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/employers/me/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smtp }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!smtp.smtpEmail || !smtp.smtpAppPassword) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/employers/me/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smtp }),
      });
      const data = await res.json();
      setTestResult({ ok: res.ok, message: data.message ?? (res.ok ? t("testEmailSent") : t("testFailed")) });
    } catch {
      setTestResult({ ok: false, message: t("networkError") });
    } finally {
      setTesting(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/employers/me/smtp", {
        method: "DELETE",
      });
      if (res.ok) {
        setSmtp({ smtpEmail: "", smtpAppPassword: "", smtpHost: "smtp.gmail.com", smtpPort: 587, smtpSecure: false });
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!isPremium) {
    return (
      <SectionCard>
        <SectionHeader icon={Mail} title={t("customEmailSmtp")} description={t("customEmailSmtpNonPremiumDesc")} />
        <div className="p-6">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20">
            <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t("premiumFeature")}</p>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/70 mt-0.5">
                {t("premiumFeatureDesc")}
              </p>
            </div>
          </div>
        </div>
      </SectionCard>
    );
  }

  if (loading) {
    return <div className="h-32 animate-pulse rounded-xl bg-muted/30" />;
  }

  return (
    <SectionCard>
      <SectionHeader icon={Mail} title={t("customEmailSmtp")} description={t("customEmailSmtpDesc")} />
      <div className="p-6 space-y-3 sm:space-y-4">
        <p className="text-xs text-muted-foreground">
          {t("smtpIntro")}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel>{t("smtpEmail")}</FieldLabel>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
              <Input
                type="email"
                className="pl-10"
                placeholder={t("smtpEmailPlaceholder")}
                value={smtp.smtpEmail}
                onChange={(e) => setSmtp((s) => ({ ...s, smtpEmail: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <FieldLabel>{t("appPassword")}</FieldLabel>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                value={smtp.smtpAppPassword}
                onChange={(e) => setSmtp((s) => ({ ...s, smtpAppPassword: e.target.value }))}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {t("appPasswordHint")}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <FieldLabel>{t("smtpHost")}</FieldLabel>
            <Input
              placeholder="smtp.gmail.com"
              value={smtp.smtpHost}
              onChange={(e) => setSmtp((s) => ({ ...s, smtpHost: e.target.value }))}
            />
          </div>
          <div>
            <FieldLabel>{t("smtpPort")}</FieldLabel>
            <Input
              type="number"
              placeholder="587"
              value={smtp.smtpPort}
              onChange={(e) => setSmtp((s) => ({ ...s, smtpPort: parseInt(e.target.value) || 587 }))}
            />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={smtp.smtpSecure}
                onChange={(e) => setSmtp((s) => ({ ...s, smtpSecure: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              {t("sslTls")}
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button size="sm" onClick={handleSave} disabled={saving || !smtp.smtpEmail}>
            <Save className="w-3.5 h-3.5 me-1.5" />
            {saving ? t("saving") : t("saveSmtp")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing || !smtp.smtpEmail || !smtp.smtpAppPassword || smtp.smtpAppPassword === "â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"}
          >
            <Send className="w-3.5 h-3.5 me-1.5" />
            {testing ? t("sending") : t("testEmail")}
          </Button>
          {smtp.smtpEmail && (
            <Button variant="ghost" size="sm" onClick={handleClear} disabled={saving} className="text-destructive hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5 me-1.5" />
              {t("clearOverride")}
            </Button>
          )}
          {saved && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
          {testResult && (
            <span className={`text-sm ${testResult.ok ? "text-green-600" : "text-red-600"}`}>
              {testResult.message}
            </span>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
