"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, Send, Globe, ReceiptText, Banknote, Check } from "lucide-react";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CurrencySelect } from "@/components/ui/currency-select";
import { Switch } from "@/components/ui/switch";
import { TwoFactorCard } from "@/components/features/settings/TwoFactorCard";
import { ChangeEmailCard } from "@/components/features/settings/ChangeEmailCard";
import { ConnectedAppsCard } from "@/components/features/settings/ConnectedAppsCard";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { CommissionCountryRules, commissionRuleProblem, type CommissionOverride } from "./_components/CommissionCountryRules";

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


interface InvoiceIssuerBank {
  bankName: string;
  accountName: string;
  accountNumber: string;
  iban: string;
  swift: string;
  branch: string;
  instructions: string;
}

/**
 * The FROM block and payment instructions printed on every invoice PDF.
 * `addressText` is the textarea's value; it is split into `addressLines` on
 * save, because an address is lines rather than one string.
 */
interface InvoiceIssuerForm {
  legalName: string;
  addressText: string;
  country: string;
  taxRegNo: string;
  email: string;
  phone: string;
  website: string;
  bank: InvoiceIssuerBank;
  footerNote: string;
}

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

const EMPTY_ISSUER: InvoiceIssuerForm = {
  legalName: "",
  addressText: "",
  country: "",
  taxRegNo: "",
  email: "",
  phone: "",
  website: "",
  bank: { bankName: "", accountName: "", accountNumber: "", iban: "", swift: "", branch: "", instructions: "" },
  footerNote: "",
};

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
      return;
    }
    if (settings.email.provider === "ses" && sesSecretRequired) {
      toast.error(t("sesSecretRequired"));
      sesSecretRef.current?.focus();
      return;
    }
    if (settings.email.provider === "ses" && sesRegionInvalid) {
      setShowRegionError(true);
      toast.error(t("sesRegionInvalid"));
      sesRegionRef.current?.focus();
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
          smtpPasswordRef.current?.focus();
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

  return (
    <div className="page-container">
      <DashboardPageHeader title={t("pageTitle")} description={t("pageDescription")} compact compactOnMobile />

      <section className="workspace-panel-surface rounded-3xl divide-y">
        {/* General */}
        <div className="panel-body space-y-4">
          <h2 className="heading-section font-semibold text-foreground">{t("generalSectionTitle")}</h2>
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
          <div className="space-y-1">
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

        {/* Maintenance */}
        <div className="panel-body flex items-center justify-between">
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

        {/* Invoice issuer — the FROM block and payment instructions printed on
            every invoice PDF. Kept here rather than in code so a change of
            address or tax number does not need a deploy. */}
        <div className="panel-body space-y-4">
          <div>
            <h2 className="heading-section font-semibold text-foreground flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-primary" />
              {t("invoiceIssuerTitle")}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">{t("invoiceIssuerDescription")}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label htmlFor="issuer-legal-name" className="text-sm text-muted-foreground">{t("issuerLegalNameLabel")}</label>
              <Input
                id="issuer-legal-name"
                value={settings.invoiceIssuer.legalName}
                placeholder={t("issuerLegalNamePlaceholder")}
                onChange={(e) => setSettings((s) => ({ ...s, invoiceIssuer: { ...s.invoiceIssuer, legalName: e.target.value } }))}
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label htmlFor="issuer-address" className="text-sm text-muted-foreground">{t("issuerAddressLabel")}</label>
              <Textarea
                id="issuer-address"
                rows={3}
                value={settings.invoiceIssuer.addressText}
                placeholder={t("issuerAddressPlaceholder")}
                onChange={(e) => setSettings((s) => ({ ...s, invoiceIssuer: { ...s.invoiceIssuer, addressText: e.target.value } }))}
              />
              <p className="text-xs text-muted-foreground">{t("issuerAddressHelp")}</p>
            </div>

            <div className="space-y-1">
              <label htmlFor="issuer-country" className="text-sm text-muted-foreground">{t("issuerCountryLabel")}</label>
              <Input
                id="issuer-country"
                value={settings.invoiceIssuer.country}
                onChange={(e) => setSettings((s) => ({ ...s, invoiceIssuer: { ...s.invoiceIssuer, country: e.target.value } }))}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="issuer-tax-reg" className="text-sm text-muted-foreground">{t("issuerTaxRegLabel")}</label>
              <Input
                id="issuer-tax-reg"
                value={settings.invoiceIssuer.taxRegNo}
                placeholder={t("issuerTaxRegPlaceholder")}
                onChange={(e) => setSettings((s) => ({ ...s, invoiceIssuer: { ...s.invoiceIssuer, taxRegNo: e.target.value } }))}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="issuer-email" className="text-sm text-muted-foreground">{t("issuerEmailLabel")}</label>
              <Input
                id="issuer-email"
                type="email"
                value={settings.invoiceIssuer.email}
                onChange={(e) => setSettings((s) => ({ ...s, invoiceIssuer: { ...s.invoiceIssuer, email: e.target.value } }))}
              />
            </div>

            <PhoneInput
              id="issuer-phone"
              label={t("issuerPhoneLabel")}
              value={settings.invoiceIssuer.phone}
              onChange={(value) => setSettings((s) => ({ ...s, invoiceIssuer: { ...s.invoiceIssuer, phone: value } }))}
            />

            <div className="space-y-1 sm:col-span-2">
              <label htmlFor="issuer-website" className="text-sm text-muted-foreground">{t("issuerWebsiteLabel")}</label>
              <Input
                id="issuer-website"
                value={settings.invoiceIssuer.website}
                placeholder={t("issuerWebsitePlaceholder")}
                onChange={(e) => setSettings((s) => ({ ...s, invoiceIssuer: { ...s.invoiceIssuer, website: e.target.value } }))}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 card-pad space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Banknote className="h-4 w-4 text-primary" /> {t("issuerBankTitle")}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">{t("issuerBankDescription")}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="issuer-bank-name" className="text-sm text-muted-foreground">{t("issuerBankNameLabel")}</label>
                <Input
                  id="issuer-bank-name"
                  value={settings.invoiceIssuer.bank.bankName}
                  onChange={(e) => setSettings((s) => ({ ...s, invoiceIssuer: { ...s.invoiceIssuer, bank: { ...s.invoiceIssuer.bank, bankName: e.target.value } } }))}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="issuer-account-name" className="text-sm text-muted-foreground">{t("issuerAccountNameLabel")}</label>
                <Input
                  id="issuer-account-name"
                  value={settings.invoiceIssuer.bank.accountName}
                  onChange={(e) => setSettings((s) => ({ ...s, invoiceIssuer: { ...s.invoiceIssuer, bank: { ...s.invoiceIssuer.bank, accountName: e.target.value } } }))}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="issuer-account-number" className="text-sm text-muted-foreground">{t("issuerAccountNumberLabel")}</label>
                <Input
                  id="issuer-account-number"
                  value={settings.invoiceIssuer.bank.accountNumber}
                  onChange={(e) => setSettings((s) => ({ ...s, invoiceIssuer: { ...s.invoiceIssuer, bank: { ...s.invoiceIssuer.bank, accountNumber: e.target.value } } }))}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="issuer-iban" className="text-sm text-muted-foreground">{t("issuerIbanLabel")}</label>
                <Input
                  id="issuer-iban"
                  value={settings.invoiceIssuer.bank.iban}
                  onChange={(e) => setSettings((s) => ({ ...s, invoiceIssuer: { ...s.invoiceIssuer, bank: { ...s.invoiceIssuer.bank, iban: e.target.value } } }))}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="issuer-swift" className="text-sm text-muted-foreground">{t("issuerSwiftLabel")}</label>
                <Input
                  id="issuer-swift"
                  value={settings.invoiceIssuer.bank.swift}
                  onChange={(e) => setSettings((s) => ({ ...s, invoiceIssuer: { ...s.invoiceIssuer, bank: { ...s.invoiceIssuer.bank, swift: e.target.value } } }))}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="issuer-branch" className="text-sm text-muted-foreground">{t("issuerBranchLabel")}</label>
                <Input
                  id="issuer-branch"
                  value={settings.invoiceIssuer.bank.branch}
                  onChange={(e) => setSettings((s) => ({ ...s, invoiceIssuer: { ...s.invoiceIssuer, bank: { ...s.invoiceIssuer.bank, branch: e.target.value } } }))}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label htmlFor="issuer-instructions" className="text-sm text-muted-foreground">{t("issuerInstructionsLabel")}</label>
                <Textarea
                  id="issuer-instructions"
                  rows={2}
                  value={settings.invoiceIssuer.bank.instructions}
                  placeholder={t("issuerInstructionsPlaceholder")}
                  onChange={(e) => setSettings((s) => ({ ...s, invoiceIssuer: { ...s.invoiceIssuer, bank: { ...s.invoiceIssuer.bank, instructions: e.target.value } } }))}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="issuer-footer" className="text-sm text-muted-foreground">{t("issuerFooterLabel")}</label>
            <Input
              id="issuer-footer"
              value={settings.invoiceIssuer.footerNote}
              placeholder={t("issuerFooterPlaceholder")}
              onChange={(e) => setSettings((s) => ({ ...s, invoiceIssuer: { ...s.invoiceIssuer, footerNote: e.target.value } }))}
            />
            <p className="text-xs text-muted-foreground">{t("issuerFooterHelp")}</p>
          </div>
        </div>

        <CommissionCountryRules
          rules={settings.commissionOverrides}
          onChange={(commissionOverrides) => setSettings((s) => ({ ...s, commissionOverrides }))}
        />

        {/* Email delivery: provider switch, SES, SMTP, test */}
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

      <TwoFactorCard />

      <ChangeEmailCard />
      <ConnectedAppsCard />

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t("savingSaving") : t("saveButton")}
        </Button>
        {saved && <span className="inline-flex items-center gap-1 text-sm text-green-600"><Check className="h-4 w-4" aria-hidden="true" />{t("saveSuccess")}</span>}
      </div>
    </div>
  );
}
