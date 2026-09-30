"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { MapPin, Phone, Mail, Send, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { FieldError } from "@/components/shared/FieldError";
import { RequiredMark } from "@/components/ui/required-mark";
import { EMAIL_PATTERN } from "@/lib/errors/email-pattern";

const COMPANY_ADDRESS = "MPLOYEDIN UK LTD, X2 Greenleaf Walk, Southall, UB1 1FR";
const SUPPORT_EMAIL = "support@mployedin.com";

type ContactField = "name" | "email" | "message";
/** In form order, so a failed submit focuses the first problem. */
const REQUIRED_FIELDS: ContactField[] = ["name", "email", "message"];

export default function ContactPage() {
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const t = useTranslations("landing");
  const tc = useTranslations("common");

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ContactField, string>>>({});
  // Render email only after mount to prevent Cloudflare Email Obfuscation
  // from rewriting it, which would trigger React hydration mismatch error #418
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!prev[name as ContactField]) return prev;
      const next = { ...prev };
      delete next[name as ContactField];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const nextErrors: Partial<Record<ContactField, string>> = {};
    if (!form.name.trim()) nextErrors.name = t("contactNameRequired");
    if (!form.email.trim()) nextErrors.email = t("contactEmailRequired");
    else if (!EMAIL_PATTERN.test(form.email.trim())) nextErrors.email = t("contactEmailInvalid");
    if (!form.message.trim()) nextErrors.message = t("contactMessageRequired");
    setFieldErrors(nextErrors);
    const firstInvalid = REQUIRED_FIELDS.find((field) => nextErrors[field]);
    if (firstInvalid) {
      document.getElementById(`contact-${firstInvalid}`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setSuccess(true);
      setForm({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="py-12">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold">{t("contactHeading")}</h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">{t("contactSubtitle")}</p>
        </div>

        <div className="grid gap-10 lg:grid-cols-5">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border bg-card space-y-6 panel-body">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold">{t("addressLabel")}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{COMPANY_ADDRESS}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold">{t("phoneLabel2")}</h2>
                  {/* Phone number hidden (no real number configured) */}
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold">{t("emailLabel2")}</h2>
                  <a
                    href={mounted ? `mailto:${SUPPORT_EMAIL}` : undefined}
                    className="text-sm text-muted-foreground mt-1 transition-colors [overflow-wrap:anywhere] hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    suppressHydrationWarning
                  >
                    {mounted ? SUPPORT_EMAIL : t("emailLabel2")}
                  </a>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-muted/30 h-52 flex items-center justify-center">
              <span className="text-sm text-muted-foreground">{t("mapLocation")}</span>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="rounded-xl border bg-card panel-body">
              {success ? (
                <div className="text-center py-10">
                  <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
                  <h2 className="heading-subsection font-semibold">{t("messageSentHeading")}</h2>
                  <p className="text-muted-foreground mt-2">{t("messageSentBody")}</p>
                  <Button className="mt-6" onClick={() => setSuccess(false)}>
                    {t("sendAnotherMessage")}
                  </Button>
                </div>
              ) : (
                // `noValidate`: handleSubmit explains each problem under its field
                // instead of the browser's untranslated, short-lived bubble.
                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                  <p className="text-xs text-muted-foreground">{tc("requiredFieldsNote")}</p>
                  {error && (
                    <div role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 text-destructive p-3 text-sm">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="contact-name" className="text-sm font-medium mb-1.5 block">
                        {t("fullNameLabel")} <RequiredMark />
                      </label>
                      <Input
                        id="contact-name" name="name" value={form.name} onChange={handleChange} required placeholder={t("fullNamePlaceholder")}
                        aria-invalid={fieldErrors.name ? true : undefined}
                        aria-describedby={fieldErrors.name ? "contact-name-error" : undefined}
                      />
                      <FieldError id="contact-name-error" message={fieldErrors.name} />
                    </div>
                    <div>
                      <label htmlFor="contact-email" className="text-sm font-medium mb-1.5 block">
                        {t("emailLabel2")} <RequiredMark />
                      </label>
                      <Input
                        id="contact-email" type="email" name="email" value={form.email} onChange={handleChange} required placeholder="you@example.com"
                        aria-invalid={fieldErrors.email ? true : undefined}
                        aria-describedby={fieldErrors.email ? "contact-email-error" : undefined}
                      />
                      <FieldError id="contact-email-error" message={fieldErrors.email} />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <PhoneInput
                        id="contact-phone"
                        label={t("phoneMobile")}
                        value={form.phone}
                        onChange={(phone) => setForm((prev) => ({ ...prev, phone }))}
                      />
                    </div>
                    <div>
                      <label htmlFor="contact-subject" className="text-sm font-medium mb-1.5 block">{t("subjectField")}</label>
                      <Input id="contact-subject" name="subject" value={form.subject} onChange={handleChange} placeholder={t("subjectPlaceholder")} />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="contact-message" className="text-sm font-medium mb-1.5 block">
                      {t("messageField")} <RequiredMark />
                    </label>
                    <textarea
                      id="contact-message"
                      name="message"
                      value={form.message}
                      onChange={handleChange}
                      required
                      rows={5}
                      aria-invalid={fieldErrors.message ? true : undefined}
                      aria-describedby={fieldErrors.message ? "contact-message-error" : undefined}
                      placeholder={t("messagePlaceholder")}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                    />
                    <FieldError id="contact-message-error" message={fieldErrors.message} />
                  </div>

                  <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        {t("sendingMessage")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Send className="h-4 w-4" />
                        {t("sendMessageBtn")}
                      </span>
                    )}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
