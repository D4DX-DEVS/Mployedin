"use client";

import { useState, useEffect, useRef, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, Send, Globe, ReceiptText, Check, Building2, Percent, Palette, ShieldCheck } from "lucide-react";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencySelect } from "@/components/ui/currency-select";
import { Switch } from "@/components/ui/switch";
import { TwoFactorCard } from "@/components/features/settings/TwoFactorCard";
import { ChangeEmailCard } from "@/components/features/settings/ChangeEmailCard";
import { ConnectedAppsCard } from "@/components/features/settings/ConnectedAppsCard";
import { BrandKitEditor } from "@/components/features/poster/BrandKitEditor";
import { PosterContactForm } from "@/components/features/poster/PosterContactForm";
import { CommissionCountryRules, commissionRuleProblem, type CommissionOverride } from "./_components/CommissionCountryRules";
import { GeneralSectionNav, type GeneralSectionItem } from "./_components/GeneralSectionNav";
import { InvoiceIssuerSection, EMPTY_ISSUER, type InvoiceIssuerForm } from "./_components/InvoiceIssuerSection";

interface SmtpConfig {
  smtpEmail: string;
  smtpAppPassword: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
}

interface SesConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromEmail: string;
  fromName: string;
  configurationSet: string;
}

interface EmailProviderConfig {
  /** null: no provider saved yet (sendEmail() then uses saved SMTP, else the server environment). */
  provider: "smtp" | "ses" | null;
  ses: SesConfig;
}

const EMPTY_SES: SesConfig = { region: "", accessKeyId: "", secretAccessKey: "", fromEmail: "", fromName: "", configurationSet: "" };

/**
 * What GET/POST /api/admin/settings send in place of a stored secret, and what the form sends back
 * unchanged to keep it. A literal rather than an import: the validators module pulls next/server
 * into the client bundle. A test pins it to the server's SECRET_MASK.
 */
const SECRET_MASK = "••••••••";

/** SES_REGION_RE in src/lib/validators/settings.ts (not imported, for the same reason as the mask). */
const SES_REGION_RE = /^[a-z]{2}-[a-z]+-\d$/;

/** The server's email block as form state. `ses` is absent until an admin has saved SES; `provider` until one was chosen. */
function toEmailConfig(email: { provider?: string; ses?: Partial<SesConfig> } | undefined): EmailProviderConfig {
  return {
    provider: email?.provider === "ses" || email?.provider === "smtp" ? email.provider : null,
    ses: {
      region: email?.ses?.region ?? "",
      accessKeyId: email?.ses?.accessKeyId ?? "",
      secretAccessKey: email?.ses?.secretAccessKey ?? "",
      fromEmail: email?.ses?.fromEmail ?? "",
      fromName: email?.ses?.fromName ?? "",
      configurationSet: email?.ses?.configurationSet ?? "",
    },
  };
}



/** The General tab's topics; each renders on its own, chosen from the side nav and kept in ?section=. */
const SECTION_KEYS = ["platform", "invoices", "commissions", "email", "branding", "account"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];
/** Topics whose fields go out with the shared Save button; Branding and Account save themselves. */
const SAVED_SECTIONS: readonly SectionKey[] = ["platform", "invoices", "commissions", "email"];
const isSectionKey = (v: string | null): v is SectionKey => !!v && (SECTION_KEYS as readonly string[]).includes(v);

interface SystemSettings {
  platformName: string;
  supportEmail: string;
  maintenanceMode: boolean;
  defaultCurrency: string;
  smtp: SmtpConfig;
  email: EmailProviderConfig;
  invoiceIssuer: InvoiceIssuerForm;
  commissionOverrides: CommissionOverride[];
}

export default function AdminSettingsPage() {
  const t = useTranslations("adminSettings");
  const ta = useTranslations("a11y");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showSesSecret, setShowSesSecret] = useState(false);
  const sesSecretRef = useRef<HTMLInputElement>(null);
  // The server refused the stored SMTP password for a changed host or user (smtp_password_required).
  const [smtpPasswordRequired, setSmtpPasswordRequired] = useState(false);
  const smtpPasswordRef = useRef<HTMLInputElement>(null);
  const [testTo, setTestTo] = useState("");
  // What the server has stored for SES (the secret as the mask). The key ID and secret are a pair:
  // this is how an edited key ID is told apart from the stored one.
  const [savedSes, setSavedSes] = useState<SesConfig>(EMPTY_SES);
  // The provider the server has stored: the email block is only sent when it or an SES field changed,
  // so saving another section never writes a provider the admin did not choose.
  const [savedProvider, setSavedProvider] = useState<EmailProviderConfig["provider"]>(null);
  const sesRegionRef = useRef<HTMLInputElement>(null);
  const [showRegionError, setShowRegionError] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; detail?: string } | null>(null);
  const [section, setSection] = useState<SectionKey>("platform");

  // ?section= keeps the topic across reloads and shared links. Read once on mount and written with
  // history.replaceState: useSearchParams would need a Suspense boundary around the whole form.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("section");
    if (isSectionKey(fromUrl)) setSection(fromUrl);
  }, []);

  const selectSection = (key: SectionKey) => {
    setSection(key);
    const url = new URL(window.location.href);
    if (key === "platform") url.searchParams.delete("section");
    else url.searchParams.set("section", key);
    window.history.replaceState(window.history.state, "", url);
  };

  /** Opens the topic holding a field the save refused, then focuses it once that topic has rendered. */
  const focusInSection = (key: SectionKey, ref: RefObject<HTMLInputElement | null>) => {
    selectSection(key);
    window.setTimeout(() => ref.current?.focus(), 0);
  };

  const sections: GeneralSectionItem<SectionKey>[] = [
    { key: "platform", label: t("sectionPlatform"), description: t("sectionPlatformDesc"), icon: Building2 },
    { key: "invoices", label: t("sectionInvoices"), description: t("sectionInvoicesDesc"), icon: ReceiptText },
    { key: "commissions", label: t("sectionCommissions"), description: t("sectionCommissionsDesc"), icon: Percent },
    { key: "email", label: t("sectionEmail"), description: t("sectionEmailDesc"), icon: Mail },
    { key: "branding", label: t("sectionBranding"), description: t("sectionBrandingDesc"), icon: Palette },
    { key: "account", label: t("sectionAccount"), description: t("sectionAccountDesc"), icon: ShieldCheck },
  ];
  const [settings, setSettings] = useState<SystemSettings>({
    platformName: "MPLOYEDIN",
    supportEmail: "support@mployedin.com",
    maintenanceMode: false,
    defaultCurrency: "AED",
    smtp: {
      smtpEmail: "",
      smtpAppPassword: "",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpSecure: false,
    },
    email: { provider: null, ses: EMPTY_SES },
    invoiceIssuer: EMPTY_ISSUER,
    commissionOverrides: [],
  });

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => {
        if (!r.ok) {
          toast.error(t("failedToLoadSettings"));
          throw new Error("Failed to load settings");
        }
        return r.json();
      })
      .then((data) => {
        if (data.settings) {
          const email = toEmailConfig(data.settings.email);
          setSavedSes(email.ses);
          setSavedProvider(email.provider);
          setSettings({
            platformName: data.settings.platformName ?? "MPLOYEDIN",
            supportEmail: data.settings.supportEmail ?? "support@mployedin.com",
            maintenanceMode: data.settings.maintenanceMode ?? false,
            defaultCurrency: data.settings.defaultCurrency ?? "AED",
            smtp: {
              smtpEmail: data.settings.smtp?.smtpEmail ?? "",
              smtpAppPassword: data.settings.smtp?.smtpAppPassword ?? "",
              smtpHost: data.settings.smtp?.smtpHost ?? "smtp.gmail.com",
              smtpPort: data.settings.smtp?.smtpPort ?? 587,
              smtpSecure: data.settings.smtp?.smtpSecure ?? false,
            },
            email,
            invoiceIssuer: {
              legalName: data.settings.invoiceIssuer?.legalName ?? "",
              addressText: (data.settings.invoiceIssuer?.addressLines ?? []).join("\n"),
              country: data.settings.invoiceIssuer?.country ?? "",
              taxRegNo: data.settings.invoiceIssuer?.taxRegNo ?? "",
              email: data.settings.invoiceIssuer?.email ?? "",
              phone: data.settings.invoiceIssuer?.phone ?? "",
              website: data.settings.invoiceIssuer?.website ?? "",
              bank: {
                bankName: data.settings.invoiceIssuer?.bank?.bankName ?? "",
                accountName: data.settings.invoiceIssuer?.bank?.accountName ?? "",
                accountNumber: data.settings.invoiceIssuer?.bank?.accountNumber ?? "",
                iban: data.settings.invoiceIssuer?.bank?.iban ?? "",
                swift: data.settings.invoiceIssuer?.bank?.swift ?? "",
                branch: data.settings.invoiceIssuer?.bank?.branch ?? "",
                instructions: data.settings.invoiceIssuer?.bank?.instructions ?? "",
              },
              footerNote: data.settings.invoiceIssuer?.footerNote ?? "",
            },
            commissionOverrides: data.settings.commissionOverrides ?? [],
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // The key ID and secret are a pair. Editing the key ID drops the mask (updateSes), so a stored
  // secret that belongs to the old key is never kept or tested: the admin types the new one.
  const sesSecretRequired =
    settings.email.ses.secretAccessKey === "" &&
    savedSes.secretAccessKey !== "" &&
    settings.email.ses.accessKeyId !== savedSes.accessKeyId;
  const sesRegionInvalid = settings.email.ses.region !== "" && !SES_REGION_RE.test(settings.email.ses.region);
  const emailChanged =
    settings.email.provider !== savedProvider ||
    (Object.keys(EMPTY_SES) as (keyof SesConfig)[]).some((k) => settings.email.ses[k] !== savedSes[k]);
  const sesReady = Boolean(settings.email.ses.region && settings.email.ses.accessKeyId && settings.email.ses.secretAccessKey && settings.email.ses.fromEmail);
  const smtpReady = Boolean(settings.smtp.smtpEmail && settings.smtp.smtpAppPassword);
  const canTest = settings.email.provider === "ses" ? sesReady : smtpReady;

  const handleSave = async () => {
    const ruleProblem = commissionRuleProblem(settings.commissionOverrides);
    if (ruleProblem) {
      toast.error(ruleProblem === "missingCountry" ? t("commissionRuleMissingCountry") : t("commissionRuleDuplicateCountry"));
      selectSection("commissions");
      return;
    }
    if (settings.email.provider === "ses" && sesSecretRequired) {
      toast.error(t("sesSecretRequired"));
      focusInSection("email", sesSecretRef);
      return;
    }
    if (settings.email.provider === "ses" && sesRegionInvalid) {
      setShowRegionError(true);
      toast.error(t("sesRegionInvalid"));
      focusInSection("email", sesRegionRef);
      return;
    }
    // With SES hidden, an edited key ID without its secret is left out: the server would pair it with the old stored secret.
    // A malformed region is left out too: the server would reject the whole save over it.
    const ses = {
      ...settings.email.ses,
      ...(sesSecretRequired ? { accessKeyId: undefined } : {}),
      ...(sesRegionInvalid ? { region: undefined } : {}),
    };
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          email: emailChanged ? { provider: settings.email.provider ?? undefined, ses } : undefined,
          invoiceIssuer: {
            ...settings.invoiceIssuer,
            addressText: undefined,
            addressLines: settings.invoiceIssuer.addressText
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean),
          },
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaved(true);
        toast.success(t("settingsSavedSuccessfully"));
        if (data.warning === "ses_incomplete") toast.warning(t("sesIncompleteWarning"));
        if (data.settings?.email) {
          // Show what the server stored: a secret typed just now goes back to the mask.
          const email = toEmailConfig(data.settings.email);
          setSettings((s) => ({ ...s, email }));
          setSavedSes(email.ses);
          setSavedProvider(email.provider);
        }
        setTimeout(() => setSaved(false), 2500);
      } else {
        // The body is a validation or permission answer, not copy for the admin: only its machine code is read.
        const body = await res.json().catch(() => null);
        if (res.status === 400 && body?.error === "smtp_password_required") {
          setSmtpPasswordRequired(true);
          toast.error(t("smtpPasswordRequired"));
          focusInSection("email", smtpPasswordRef);
        } else {
          toast.error(t("failedToSaveSettings"));
        }
      }
    } catch (error) {
      toast.error(t("failedToSaveSettings"));
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!canTest) return;
    // The server cannot use the stored SMTP password it masked; say so here, in the admin's language.
    if (settings.email.provider === "smtp" && settings.smtp.smtpAppPassword === SECRET_MASK) {
      setTestResult({ ok: false, message: t("testEmailEnterPassword") });
      return;
    }
    setTestingEmail(true);
    setTestResult(null);
    const to = testTo.trim() || undefined;
    // Where the route sends it when no recipient is given: the From address of the chosen provider.
    const sentTo = to ?? (settings.email.provider === "ses" ? settings.email.ses.fromEmail : settings.smtp.smtpEmail);
    const body =
      settings.email.provider === "ses"
        ? { provider: "ses", ses: settings.email.ses, to }
        : { provider: "smtp", smtp: settings.smtp, to };
    try {
      const res = await fetch("/api/admin/settings/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTestResult({ ok: true, message: t("testEmailSentTo", { to: sentTo }) });
      } else {
        // A 500 is a send failure: the provider's own reply (for example "Email address is not
        // verified") is what fixes it, so it goes under the headline. Any other answer is a
        // validation or permission body with nothing for the admin to read.
        const providerReply = res.status === 500 && typeof data.message === "string" && data.message ? data.message : undefined;
        setTestResult({ ok: false, message: t("testEmailError"), detail: providerReply });
      }
    } catch {
      setTestResult({ ok: false, message: t("networkError") });
    } finally {
      setTestingEmail(false);
    }
  };

  const updateSmtp = (field: keyof SmtpConfig, value: string | number | boolean) => {
    setSettings((s) => ({ ...s, smtp: { ...s.smtp, [field]: value } }));
    // A new password, or the stored host and user back, answers the server's refusal; the next save checks again.
    if (field === "smtpAppPassword" || field === "smtpHost" || field === "smtpEmail") setSmtpPasswordRequired(false);
  };
  const updateSes = (field: keyof SesConfig, value: string) => {
    setSettings((s) => {
      const ses = { ...s.email.ses, [field]: value };
      if (field === "accessKeyId") {
        const isSavedKey = value === savedSes.accessKeyId && savedSes.secretAccessKey !== "";
        if (ses.secretAccessKey === SECRET_MASK && !isSavedKey) ses.secretAccessKey = "";
        else if (ses.secretAccessKey === "" && isSavedKey) ses.secretAccessKey = SECRET_MASK;
      }
      return { ...s, email: { ...s.email, ses } };
    });
  };
  const setProvider = (provider: "smtp" | "ses") => {
    setSettings((s) => ({ ...s, email: { ...s.email, provider } }));
    setTestResult(null);
  };

  if (loading) {
    return (
      <div className="page-container">
        <DashboardPageHeader title={t("pageTitle")} description={t("pageDescription")} />
        <div className="bg-card rounded-xl border animate-pulse h-48" />
      </div>
    );
  }

  const showSaveBar = SAVED_SECTIONS.includes(section);

  return (
    <div className="page-container">
      <DashboardPageHeader title={t("pageTitle")} description={t("pageDescription")} compact compactOnMobile />

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-6">
        <GeneralSectionNav items={sections} active={section} onSelect={selectSection} label={t("generalNavLabel")} />

        <div className="min-w-0 space-y-4">
          {section === "platform" && (
            <section className="workspace-panel-surface rounded-3xl divide-y" aria-labelledby="admin-settings-platform-title">
              <div className="panel-body space-y-4">
                <div>
                  <h2 id="admin-settings-platform-title" className="heading-section font-semibold text-foreground flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
                    {t("sectionPlatform")}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{t("sectionPlatformDesc")}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="admin-platform-name" className="text-sm text-muted-foreground">{t("platformNameLabel")}</label>
                    <Input
                      id="admin-platform-name"
                      value={settings.platformName}
                      onChange={(e) => setSettings((s) => ({ ...s, platformName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="admin-support-email" className="text-sm text-muted-foreground">{t("supportEmailLabel")}</label>
                    <Input
                      id="admin-support-email"
                      type="email"
                      value={settings.supportEmail}
                      onChange={(e) => setSettings((s) => ({ ...s, supportEmail: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5" /> {t("defaultCurrencyLabel")}
                    </label>
                    <CurrencySelect
                      ariaLabel={t("defaultCurrencyLabel")}
                      value={settings.defaultCurrency}
                      onValueChange={(v) => setSettings((s) => ({ ...s, defaultCurrency: v }))}
                      placeholder={t("defaultCurrencyPlaceholder")}
                      className="max-w-xs"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("defaultCurrencyHelp")}
                    </p>
                  </div>
                </div>
              </div>
              <div className="panel-body flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-foreground">{t("maintenanceModeLabel")}</div>
                  <div className="text-sm text-muted-foreground">{t("maintenanceModeDescription")}</div>
                </div>
                <Switch
                  checked={settings.maintenanceMode}
                  onCheckedChange={(checked) => setSettings((s) => ({ ...s, maintenanceMode: checked }))}
                  aria-label={t("maintenanceModeLabel")}
                />
              </div>
            </section>
          )}

          {section === "invoices" && (
            <section className="workspace-panel-surface rounded-3xl divide-y" aria-labelledby="admin-settings-invoices-title">
              <div className="panel-body">
                <h2 id="admin-settings-invoices-title" className="heading-section font-semibold text-foreground flex items-center gap-2">
                  <ReceiptText className="h-4 w-4 text-primary" aria-hidden="true" />
                  {t("invoiceIssuerTitle")}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">{t("invoiceIssuerDescription")}</p>
              </div>
              <InvoiceIssuerSection
                value={settings.invoiceIssuer}
                onChange={(update) => setSettings((s) => ({ ...s, invoiceIssuer: update(s.invoiceIssuer) }))}
              />
            </section>
          )}

          {section === "commissions" && (
            <section className="workspace-panel-surface rounded-3xl">
              <CommissionCountryRules
                rules={settings.commissionOverrides}
                onChange={(commissionOverrides) => setSettings((s) => ({ ...s, commissionOverrides }))}
              />
            </section>
          )}

          {section === "email" && (
            <section className="workspace-panel-surface rounded-3xl">
              <div className="panel-body space-y-5">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  <h2 className="heading-section font-semibold text-foreground">{t("emailDeliveryTitle")}</h2>
                </div>
                <p className="text-sm text-muted-foreground">{t("emailDeliveryDescription")}</p>

                <fieldset className="space-y-2">
                  <legend className="text-sm text-muted-foreground">{t("emailProviderLabel")}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-lg border border-border/50 p-3 text-sm cursor-pointer has-[:checked]:border-primary">
                      <input type="radio" name="email-provider" value="smtp" checked={settings.email.provider === "smtp"} onChange={() => setProvider("smtp")} className="h-4 w-4" />
                      {t("emailProviderSmtp")}
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border border-border/50 p-3 text-sm cursor-pointer has-[:checked]:border-primary">
                      <input type="radio" name="email-provider" value="ses" checked={settings.email.provider === "ses"} onChange={() => setProvider("ses")} className="h-4 w-4" />
                      {t("emailProviderSes")}
                    </label>
                  </div>
                  {settings.email.provider === null && <p className="text-xs text-muted-foreground">{t("emailProviderNotChosen")}</p>}
                </fieldset>

                {settings.email.provider === "ses" && (
                  <div className="space-y-3 rounded-lg border border-border/50 p-4">
                    <h3 className="text-sm font-semibold">{t("sesSectionTitle")}</h3>
                    <p className="text-xs text-muted-foreground">{t("sesSetupHelp")}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label htmlFor="admin-ses-region" className="text-sm text-muted-foreground">{t("sesRegionLabel")}</label>
                        <Input
                          id="admin-ses-region"
                          ref={sesRegionRef}
                          dir="ltr"
                          placeholder={t("sesRegionPlaceholder")}
                          value={settings.email.ses.region}
                          onChange={(e) => updateSes("region", e.target.value.trim().toLowerCase())}
                          onBlur={() => setShowRegionError(true)}
                          aria-invalid={(showRegionError && sesRegionInvalid) || undefined}
                          aria-describedby={showRegionError && sesRegionInvalid ? "admin-ses-region-error" : undefined}
                          className={showRegionError && sesRegionInvalid ? "border-destructive" : undefined}
                        />
                        {showRegionError && sesRegionInvalid && (
                          <p id="admin-ses-region-error" className="text-xs text-destructive">{t("sesRegionInvalid")}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="admin-ses-from-email" className="text-sm text-muted-foreground">{t("sesFromEmailLabel")}</label>
                        <Input id="admin-ses-from-email" type="email" dir="ltr" value={settings.email.ses.fromEmail} onChange={(e) => updateSes("fromEmail", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="admin-ses-access-key" className="text-sm text-muted-foreground">{t("sesAccessKeyIdLabel")}</label>
                        <Input id="admin-ses-access-key" dir="ltr" autoComplete="off" value={settings.email.ses.accessKeyId} onChange={(e) => updateSes("accessKeyId", e.target.value.trim())} />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="admin-ses-secret" className="text-sm text-muted-foreground">{t("sesSecretAccessKeyLabel")}</label>
                        <div className="relative">
                          <Input
                            id="admin-ses-secret"
                            ref={sesSecretRef}
                            dir="ltr"
                            type={showSesSecret ? "text" : "password"}
                            autoComplete="new-password"
                            value={settings.email.ses.secretAccessKey}
                            onChange={(e) => updateSes("secretAccessKey", e.target.value.trim())}
                            required={sesSecretRequired}
                            aria-invalid={sesSecretRequired || undefined}
                            aria-describedby="admin-ses-secret-help"
                            className={sesSecretRequired ? "pr-10 border-destructive" : "pr-10"}
                          />
                          <button aria-label={showSesSecret ? ta("hidePassword") : ta("showPassword")}
                            type="button"
                            onClick={() => setShowSesSecret(!showSesSecret)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showSesSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <p id="admin-ses-secret-help" className={sesSecretRequired ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                          {sesSecretRequired ? t("sesSecretRequired") : t("sesSecretHelp")}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="admin-ses-from-name" className="text-sm text-muted-foreground">{t("sesFromNameLabel")}</label>
                        <Input id="admin-ses-from-name" value={settings.email.ses.fromName} onChange={(e) => updateSes("fromName", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="admin-ses-config-set" className="text-sm text-muted-foreground">{t("sesConfigurationSetLabel")}</label>
                        <Input id="admin-ses-config-set" dir="ltr" value={settings.email.ses.configurationSet} onChange={(e) => updateSes("configurationSet", e.target.value.trim())} />
                        <p className="text-xs text-muted-foreground">{t("sesConfigurationSetHelp")}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("emailProviderSmtpNote")}</p>
                  </div>
                )}

                <div className="space-y-3 rounded-lg border border-border/50 p-4">
                  <h3 className="text-sm font-semibold">{t("smtpSectionTitle")}</h3>
                  <p className="text-xs text-muted-foreground">{t("emailConfigDescription")}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label htmlFor="admin-smtp-email" className="text-sm text-muted-foreground">{t("smtpEmailLabel")}</label>
                      <Input
                        id="admin-smtp-email"
                        type="email"
                        placeholder={t("smtpEmailPlaceholder")}
                        value={settings.smtp.smtpEmail}
                        onChange={(e) => updateSmtp("smtpEmail", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="admin-smtp-password" className="text-sm text-muted-foreground">{t("appPasswordLabel")}</label>
                      <div className="relative">
                        <Input
                          id="admin-smtp-password"
                          ref={smtpPasswordRef}
                          type={showPassword ? "text" : "password"}
                          placeholder={t("appPasswordPlaceholder")}
                          value={settings.smtp.smtpAppPassword}
                          onChange={(e) => updateSmtp("smtpAppPassword", e.target.value)}
                          aria-invalid={smtpPasswordRequired || undefined}
                          aria-describedby="admin-smtp-password-help"
                          className={smtpPasswordRequired ? "pr-10 border-destructive" : "pr-10"}
                        />
                        <button aria-label={showPassword ? ta("hidePassword") : ta("showPassword")}
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p id="admin-smtp-password-help" className={smtpPasswordRequired ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                        {smtpPasswordRequired ? t("smtpPasswordRequired") : t("appPasswordHelp")}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <label htmlFor="admin-smtp-host" className="text-sm text-muted-foreground">{t("smtpHostLabel")}</label>
                      <Input
                        id="admin-smtp-host"
                        placeholder={t("smtpHostPlaceholder")}
                        value={settings.smtp.smtpHost}
                        onChange={(e) => updateSmtp("smtpHost", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="admin-smtp-port" className="text-sm text-muted-foreground">{t("smtpPortLabel")}</label>
                      <Input
                        id="admin-smtp-port"
                        type="number"
                        placeholder={t("smtpPortPlaceholder")}
                        value={settings.smtp.smtpPort}
                        onChange={(e) => updateSmtp("smtpPort", parseInt(e.target.value) || 587)}
                      />
                    </div>
                    <div className="flex items-end gap-2 pb-1">
                      <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.smtp.smtpSecure}
                          onChange={(e) => updateSmtp("smtpSecure", e.target.checked)}
                          className="h-4 w-4 rounded border-border"
                        />
                        {t("sslTlsLabel")}
                      </label>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <div className="space-y-1">
                    <label htmlFor="admin-email-test-to" className="text-sm text-muted-foreground">{t("testRecipientLabel")}</label>
                    <Input id="admin-email-test-to" type="email" dir="ltr" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                    <p className="text-xs text-muted-foreground">{t("testRecipientHelp")}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleTestEmail} disabled={testingEmail || !canTest} className="w-full sm:w-auto">
                    <Send className="mr-2 h-3.5 w-3.5" />
                    {testingEmail ? t("testEmailSending") : t("testEmailButton")}
                  </Button>
                </div>
                {testResult && (
                  <div role={testResult.ok ? "status" : "alert"} className={`space-y-1 text-sm ${testResult.ok ? "text-emerald-600" : "text-destructive"}`}>
                    <p>{testResult.message}</p>
                    {/* The service's own reply is English and technical: it stays behind a closed disclosure for whoever sets the service up. */}
                    {testResult.detail && (
                      <details className="rounded-lg border border-border/50 px-3 py-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer select-none rounded font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                          {t("testEmailDetailsTitle")}
                        </summary>
                        <p className="mt-1.5">
                          {t("testEmailProviderReply")}{" "}
                          <span dir="auto" className="break-words">{testResult.detail}</span>
                        </p>
                      </details>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {section === "branding" && (
            <section className="workspace-panel-surface rounded-3xl" aria-labelledby="admin-brand-kit-title">
              <div className="panel-body space-y-4">
                <div>
                  <h2 id="admin-brand-kit-title" className="heading-section font-semibold text-foreground">{t("brandKitTitle")}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{t("brandKitDesc")}</p>
                </div>
                <BrandKitEditor mode="admin" />
                <div className="mt-6 border-t pt-6">
                  <PosterContactForm />
                </div>
              </div>
            </section>
          )}

          {section === "account" && (
            <div className="space-y-4">
              <TwoFactorCard />
              <ChangeEmailCard />
              <ConnectedAppsCard />
            </div>
          )}

          {showSaveBar && (
            <div className="workspace-panel-surface rounded-3xl panel-body flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">{t("saveScopeHint")}</p>
              <div className="flex items-center gap-3">
                {saved && <span className="inline-flex items-center gap-1 text-sm text-green-600"><Check className="h-4 w-4" aria-hidden="true" />{t("saveSuccess")}</span>}
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? t("savingSaving") : t("saveButton")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
