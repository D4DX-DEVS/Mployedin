"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MapPin, Phone, Mail, Send, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ContactPage() {
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const isAr = locale === "ar";
  const t = (en: string, ar: string) => (isAr ? ar : en);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
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
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold">{t("Contact Us", "اتصل بنا")}</h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            {t(
              "Have questions? We'd love to hear from you. Send us a message and we'll respond within 24 hours.",
              "هل لديك أسئلة؟ يسعدنا سماعك. أرسل لنا رسالة وسنرد خلال 24 ساعة."
            )}
          </p>
        </div>

        <div className="grid gap-10 lg:grid-cols-5">
          {/* Contact Info */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border bg-card p-6 space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{t("Address", "العنوان")}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("Dubai, United Arab Emirates", "دبي، الإمارات العربية المتحدة")}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{t("Phone", "الهاتف")}</h3>
                  <p className="text-sm text-muted-foreground mt-1" dir="ltr">
                    +971 4 XXX XXXX
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{t("Email", "البريد الإلكتروني")}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    info@mployedin.com
                  </p>
                </div>
              </div>
            </div>

            {/* Optional map placeholder */}
            <div className="rounded-xl border bg-muted/30 h-52 flex items-center justify-center">
              <span className="text-sm text-muted-foreground">
                {t("Map Location", "موقع الخريطة")}
              </span>
            </div>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-3">
            <div className="rounded-xl border bg-card p-6">
              {success ? (
                <div className="text-center py-10">
                  <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
                  <h3 className="text-xl font-semibold">
                    {t("Message Sent!", "تم إرسال الرسالة!")}
                  </h3>
                  <p className="text-muted-foreground mt-2">
                    {t(
                      "Thank you for contacting us. We'll get back to you shortly.",
                      "شكراً لتواصلك معنا. سنعود إليك قريباً."
                    )}
                  </p>
                  <Button className="mt-6" onClick={() => setSuccess(false)}>
                    {t("Send Another Message", "إرسال رسالة أخرى")}
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="flex items-center gap-2 rounded-lg bg-destructive/10 text-destructive p-3 text-sm">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">
                        {t("Full Name", "الاسم الكامل")} <span className="text-destructive">*</span>
                      </label>
                      <Input
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        required
                        placeholder={t("John Doe", "محمد أحمد")}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">
                        {t("Email", "البريد الإلكتروني")} <span className="text-destructive">*</span>
                      </label>
                      <Input
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        required
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">
                        {t("Phone / Mobile", "الهاتف / الجوال")}
                      </label>
                      <Input
                        type="tel"
                        name="phone"
                        value={form.phone}
                        onChange={handleChange}
                        placeholder="+971 50 XXX XXXX"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">
                        {t("Subject", "الموضوع")}
                      </label>
                      <Input
                        name="subject"
                        value={form.subject}
                        onChange={handleChange}
                        placeholder={t("How can we help?", "كيف يمكننا المساعدة؟")}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      {t("Message", "الرسالة")} <span className="text-destructive">*</span>
                    </label>
                    <textarea
                      name="message"
                      value={form.message}
                      onChange={handleChange}
                      required
                      rows={5}
                      placeholder={t("Tell us what you need...", "أخبرنا بما تحتاج...")}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                    />
                  </div>

                  <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        {t("Sending...", "جاري الإرسال...")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Send className="h-4 w-4" />
                        {t("Send Message", "إرسال الرسالة")}
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
