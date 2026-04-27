// Rewrite public pages, maintenance, register, blog pages to useTranslations
// Run: node _rewrite_public_pages_i18n.js

const fs = require("fs");
const path = require("path");

const srcBase = path.join(__dirname, "src");
const messagesDir = path.join(__dirname, "messages");

// ── Load & update messages ──
const en = JSON.parse(fs.readFileSync(path.join(messagesDir, "en.json"), "utf-8"));
const ar = JSON.parse(fs.readFileSync(path.join(messagesDir, "ar.json"), "utf-8"));

// Add missing landing keys for public pages
const extraLanding = {
  blogHeading: ["Blog", "\u0627\u0644\u0645\u062f\u0648\u0646\u0629"],
  blogSubtitle: ["Insights, tips, and updates from the world of recruitment", "\u0631\u0624\u0649 \u0648\u0646\u0635\u0627\u0626\u062d \u0648\u062a\u062d\u062f\u064a\u062b\u0627\u062a \u0645\u0646 \u0639\u0627\u0644\u0645 \u0627\u0644\u062a\u0648\u0638\u064a\u0641"],
  searchArticlesPlaceholder: ["Search articles...", "\u0627\u0628\u062d\u062b \u0641\u064a \u0627\u0644\u0645\u0642\u0627\u0644\u0627\u062a..."],
  noArticlesFound: ["No articles found.", "\u0644\u0645 \u064a\u062a\u0645 \u0627\u0644\u0639\u062b\u0648\u0631 \u0639\u0644\u0649 \u0645\u0642\u0627\u0644\u0627\u062a."],
  previousPage: ["Previous", "\u0627\u0644\u0633\u0627\u0628\u0642"],
  nextPage: ["Next", "\u0627\u0644\u062a\u0627\u0644\u064a"],
  articleNotFoundHeading: ["Article Not Found", "\u0627\u0644\u0645\u0642\u0627\u0644 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f"],
  backToBlogLink: ["Back to Blog", "\u0627\u0644\u0639\u0648\u062f\u0629 \u0625\u0644\u0649 \u0627\u0644\u0645\u062f\u0648\u0646\u0629"],
  faqHeading: ["Frequently Asked Questions", "\u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0634\u0627\u0626\u0639\u0629"],
  faqSubtitle2: ["Find answers to common questions about MPLOYEDIN", "\u0627\u0628\u062d\u062b \u0639\u0646 \u0625\u062c\u0627\u0628\u0627\u062a \u0644\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0634\u0627\u0626\u0639\u0629 \u062d\u0648\u0644 \u0645\u0628\u0644\u0648\u064a\u062f\u064a\u0646"],
  allCategories2: ["All", "\u0627\u0644\u0643\u0644"],
  noFaqsFound: ["No FAQs found.", "\u0644\u0645 \u064a\u062a\u0645 \u0627\u0644\u0639\u062b\u0648\u0631 \u0639\u0644\u0649 \u0623\u0633\u0626\u0644\u0629."],
  contactHeading: ["Contact Us", "\u0627\u062a\u0635\u0644 \u0628\u0646\u0627"],
  contactSubtitle: ["Have questions? We'd love to hear from you. Send us a message and we'll respond within 24 hours.", "\u0647\u0644 \u0644\u062f\u064a\u0643 \u0623\u0633\u0626\u0644\u0629\u061f \u064a\u0633\u0639\u062f\u0646\u0627 \u0633\u0645\u0627\u0639\u0643. \u0623\u0631\u0633\u0644 \u0644\u0646\u0627 \u0631\u0633\u0627\u0644\u0629 \u0648\u0633\u0646\u0631\u062f \u062e\u0644\u0627\u0644 24 \u0633\u0627\u0639\u0629."],
  addressLabel: ["Address", "\u0627\u0644\u0639\u0646\u0648\u0627\u0646"],
  addressValue: ["Dubai, United Arab Emirates", "\u062f\u0628\u064a\u060c \u0627\u0644\u0625\u0645\u0627\u0631\u0627\u062a \u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u0627\u0644\u0645\u062a\u062d\u062f\u0629"],
  phoneLabel2: ["Phone", "\u0627\u0644\u0647\u0627\u062a\u0641"],
  emailLabel2: ["Email", "\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a"],
  mapLocation: ["Map Location", "\u0645\u0648\u0642\u0639 \u0627\u0644\u062e\u0631\u064a\u0637\u0629"],
  messageSentHeading: ["Message Sent!", "\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u0633\u0627\u0644\u0629!"],
  messageSentBody: ["Thank you for contacting us. We'll get back to you shortly.", "\u0634\u0643\u0631\u0627\u064b \u0644\u062a\u0648\u0627\u0635\u0644\u0643 \u0645\u0639\u0646\u0627. \u0633\u0646\u0639\u0648\u062f \u0625\u0644\u064a\u0643 \u0642\u0631\u064a\u0628\u0627\u064b."],
  sendAnotherMessage: ["Send Another Message", "\u0625\u0631\u0633\u0627\u0644 \u0631\u0633\u0627\u0644\u0629 \u0623\u062e\u0631\u0649"],
  fullNameLabel: ["Full Name", "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644"],
  fullNamePlaceholder: ["John Doe", "\u0645\u062d\u0645\u062f \u0623\u062d\u0645\u062f"],
  phoneMobile: ["Phone / Mobile", "\u0627\u0644\u0647\u0627\u062a\u0641 / \u0627\u0644\u062c\u0648\u0627\u0644"],
  subjectField: ["Subject", "\u0627\u0644\u0645\u0648\u0636\u0648\u0639"],
  subjectPlaceholder: ["How can we help?", "\u0643\u064a\u0641 \u064a\u0645\u0643\u0646\u0646\u0627 \u0627\u0644\u0645\u0633\u0627\u0639\u062f\u0629\u061f"],
  messageField: ["Message", "\u0627\u0644\u0631\u0633\u0627\u0644\u0629"],
  messagePlaceholder: ["Tell us what you need...", "\u0623\u062e\u0628\u0631\u0646\u0627 \u0628\u0645\u0627 \u062a\u062d\u062a\u0627\u062c..."],
  sendingMessage: ["Sending...", "\u062c\u0627\u0631\u064a \u0627\u0644\u0625\u0631\u0633\u0627\u0644..."],
  sendMessageBtn: ["Send Message", "\u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u0633\u0627\u0644\u0629"],
  privacyHeading: ["Privacy Policy", "\u0633\u064a\u0627\u0633\u0629 \u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629"],
  privacyPreparing: ["Privacy policy content is being prepared.", "\u0645\u062d\u062a\u0648\u0649 \u0633\u064a\u0627\u0633\u0629 \u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629 \u0642\u064a\u062f \u0627\u0644\u0625\u0639\u062f\u0627\u062f."],
  cookiesHeading: ["Cookie Policy", "\u0633\u064a\u0627\u0633\u0629 \u0645\u0644\u0641\u0627\u062a \u062a\u0639\u0631\u064a\u0641 \u0627\u0644\u0627\u0631\u062a\u0628\u0627\u0637"],
  cookiesPreparing: ["Cookie policy content is being prepared.", "\u0645\u062d\u062a\u0648\u0649 \u0633\u064a\u0627\u0633\u0629 \u0645\u0644\u0641\u0627\u062a \u062a\u0639\u0631\u064a\u0641 \u0627\u0644\u0627\u0631\u062a\u0628\u0627\u0637 \u0642\u064a\u062f \u0627\u0644\u0625\u0639\u062f\u0627\u062f."],
};

for (const [key, [enVal, arVal]] of Object.entries(extraLanding)) {
  if (!en.landing[key]) en.landing[key] = enVal;
  if (!ar.landing[key]) ar.landing[key] = arVal;
}

// Register page extra auth keys
const extraAuth = {
  createYourAccount: ["Create your account", "\u0623\u0646\u0634\u0626 \u062d\u0633\u0627\u0628\u0643"],
  registerSubtitle: ["Find your next opportunity with AI-powered matching.", "\u0627\u0639\u062b\u0631 \u0639\u0644\u0649 \u0641\u0631\u0635\u062a\u0643 \u0627\u0644\u062a\u0627\u0644\u064a\u0629 \u0628\u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629 \u0627\u0644\u0645\u062f\u0639\u0648\u0645\u0629 \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a."],
  fullName: ["Full Name", "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644"],
  fullNamePlaceholder: ["John Smith", "\u0645\u062d\u0645\u062f \u0623\u062d\u0645\u062f"],
  emailAddressLabel: ["Email address", "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0628\u0631\u064a\u062f"],
  confirmPassword: ["Confirm Password", "\u062a\u0623\u0643\u064a\u062f \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631"],
  confirmPasswordPlaceholder: ["Repeat your password", "\u0623\u0639\u062f \u0625\u062f\u062e\u0627\u0644 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631"],
  minChars: ["Min. 8 characters", "\u0628\u062d\u062f \u0623\u062f\u0646\u0649 8 \u0623\u062d\u0631\u0641"],
  passwordsDoNotMatch: ["Passwords do not match.", "\u0643\u0644\u0645\u0627\u062a \u0627\u0644\u0645\u0631\u0648\u0631 \u063a\u064a\u0631 \u0645\u062a\u0637\u0627\u0628\u0642\u0629."],
  passwordTooShort: ["Password must be at least 8 characters.", "\u064a\u062c\u0628 \u0623\u0646 \u062a\u0643\u0648\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 8 \u0623\u062d\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644."],
  registrationFailed: ["Registration failed. Please try again.", "\u0641\u0634\u0644 \u0627\u0644\u062a\u0633\u062c\u064a\u0644. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649."],
  alreadyHaveAccount: ["Already have an account?", "\u0644\u062f\u064a\u0643 \u062d\u0633\u0627\u0628 \u0628\u0627\u0644\u0641\u0639\u0644\u061f"],
  hiringQuestion: ["Hiring?", "\u062a\u0648\u0638\u0641\u061f"],
  registerAsEmployer: ["Register as an employer", "\u0633\u062c\u0644 \u0643\u0635\u0627\u062d\u0628 \u0639\u0645\u0644"],
};

for (const [key, [enVal, arVal]] of Object.entries(extraAuth)) {
  if (!en.auth[key]) en.auth[key] = enVal;
  if (!ar.auth[key]) ar.auth[key] = arVal;
}

// Maintenance extras
const extraMaint = {
  subtitle: ["We're currently performing scheduled maintenance to improve our platform. We'll be back shortly \u2014 thank you for your patience.", "\u0646\u0639\u0645\u0644 \u062d\u0627\u0644\u064a\u0627\u064b \u0639\u0644\u0649 \u062a\u062d\u0633\u064a\u0646 \u0627\u0644\u0645\u0646\u0635\u0629. \u0633\u0646\u0639\u0648\u062f \u0642\u0631\u064a\u0628\u0627\u064b\u060c \u0634\u0643\u0631\u0627\u064b \u0644\u0635\u0628\u0631\u0643."],
  adminHint: ["If you are an administrator, you can sign in to disable maintenance mode.", "\u0625\u0630\u0627 \u0643\u0646\u062a \u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u0646\u0638\u0627\u0645\u060c \u064a\u0645\u0643\u0646\u0643 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0644\u0625\u064a\u0642\u0627\u0641 \u0648\u0636\u0639 \u0627\u0644\u0635\u064a\u0627\u0646\u0629."],
};

if (!en.maintenance) en.maintenance = {};
if (!ar.maintenance) ar.maintenance = {};
for (const [key, [enVal, arVal]] of Object.entries(extraMaint)) {
  if (!en.maintenance[key]) en.maintenance[key] = enVal;
  if (!ar.maintenance[key]) ar.maintenance[key] = arVal;
}

fs.writeFileSync(path.join(messagesDir, "en.json"), JSON.stringify(en, null, 2) + "\n", "utf-8");
fs.writeFileSync(path.join(messagesDir, "ar.json"), JSON.stringify(ar, null, 2) + "\n", "utf-8");
console.log("OK messages updated");

// ── Rewrite files ──

const files = {};

// FAQ page
files["app/[locale]/(public)/faq/page.tsx"] = `"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";

interface FAQ {
  _id: string;
  question: string;
  questionAr: string;
  answer: string;
  answerAr: string;
  category: string;
}

export default function FAQPage() {
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const isAr = locale === "ar";
  const t = useTranslations("landing");

  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("all");

  useEffect(() => {
    fetch("/api/public/landing")
      .then((r) => r.json())
      .then((d) => setFaqs(d.faqs ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const categories = ["all", ...Array.from(new Set(faqs.map((f) => f.category)))];
  const filtered = activeCategory === "all" ? faqs : faqs.filter((f) => f.category === activeCategory);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="py-12">
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="text-center mb-12">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HelpCircle className="h-7 w-7" />
          </div>
          <h1 className="text-4xl font-bold">{t("faqHeading")}</h1>
          <p className="mt-3 text-muted-foreground">{t("faqSubtitle2")}</p>
        </div>

        {categories.length > 2 && (
          <div className="flex flex-wrap gap-2 mb-8 justify-center">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={\`rounded-full px-4 py-1.5 text-sm transition-colors \${
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }\`}
              >
                {cat === "all" ? t("allCategories2") : cat}
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">{t("noFaqsFound")}</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((faq) => (
              <div key={faq._id} className="rounded-lg border bg-card">
                <button
                  onClick={() => setOpenId(openId === faq._id ? null : faq._id)}
                  className="flex w-full items-center justify-between p-4 text-left"
                >
                  <span className="font-medium pr-4">
                    {isAr ? faq.questionAr || faq.question : faq.question}
                  </span>
                  {openId === faq._id ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
                {openId === faq._id && (
                  <div className="border-t px-4 pb-4 pt-3 text-sm text-muted-foreground leading-relaxed">
                    {isAr ? faq.answerAr || faq.answer : faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
`;

// Contact page
files["app/[locale]/(public)/contact/page.tsx"] = `"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { MapPin, Phone, Mail, Send, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ContactPage() {
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const t = useTranslations("landing");

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
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold">{t("contactHeading")}</h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">{t("contactSubtitle")}</p>
        </div>

        <div className="grid gap-10 lg:grid-cols-5">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border bg-card p-6 space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{t("addressLabel")}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{t("addressValue")}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{t("phoneLabel2")}</h3>
                  <p className="text-sm text-muted-foreground mt-1" dir="ltr">+971 4 XXX XXXX</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{t("emailLabel2")}</h3>
                  <p className="text-sm text-muted-foreground mt-1">info@mployedin.com</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-muted/30 h-52 flex items-center justify-center">
              <span className="text-sm text-muted-foreground">{t("mapLocation")}</span>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="rounded-xl border bg-card p-6">
              {success ? (
                <div className="text-center py-10">
                  <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
                  <h3 className="text-xl font-semibold">{t("messageSentHeading")}</h3>
                  <p className="text-muted-foreground mt-2">{t("messageSentBody")}</p>
                  <Button className="mt-6" onClick={() => setSuccess(false)}>
                    {t("sendAnotherMessage")}
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
                        {t("fullNameLabel")} <span className="text-destructive">*</span>
                      </label>
                      <Input name="name" value={form.name} onChange={handleChange} required placeholder={t("fullNamePlaceholder")} />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">
                        {t("emailLabel2")} <span className="text-destructive">*</span>
                      </label>
                      <Input type="email" name="email" value={form.email} onChange={handleChange} required placeholder="you@example.com" />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">{t("phoneMobile")}</label>
                      <Input type="tel" name="phone" value={form.phone} onChange={handleChange} placeholder="+971 50 XXX XXXX" dir="ltr" />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">{t("subjectField")}</label>
                      <Input name="subject" value={form.subject} onChange={handleChange} placeholder={t("subjectPlaceholder")} />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      {t("messageField")} <span className="text-destructive">*</span>
                    </label>
                    <textarea
                      name="message"
                      value={form.message}
                      onChange={handleChange}
                      required
                      rows={5}
                      placeholder={t("messagePlaceholder")}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                    />
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
`;

// Privacy page
files["app/[locale]/(public)/privacy/page.tsx"] = `"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Shield } from "lucide-react";

export default function PrivacyPolicyPage() {
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const isAr = locale === "ar";
  const t = useTranslations("landing");

  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/public/pages/privacy-policy")
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((d) => {
        if (d) {
          setBody(isAr ? d.bodyAr || d.body : d.body);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isAr]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-10">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="text-4xl font-bold">{t("privacyHeading")}</h1>
        </div>

        {body ? (
          <div
            className="prose prose-neutral dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: body }}
          />
        ) : (
          <div className="text-center text-muted-foreground py-10">
            <p>{t("privacyPreparing")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
`;

// Cookies page
files["app/[locale]/(public)/cookies/page.tsx"] = `"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Cookie } from "lucide-react";

export default function CookiePolicyPage() {
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const isAr = locale === "ar";
  const t = useTranslations("landing");

  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/public/pages/cookie-policy")
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((d) => {
        if (d) {
          setBody(isAr ? d.bodyAr || d.body : d.body);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isAr]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-10">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Cookie className="h-7 w-7" />
          </div>
          <h1 className="text-4xl font-bold">{t("cookiesHeading")}</h1>
        </div>

        {body ? (
          <div
            className="prose prose-neutral dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: body }}
          />
        ) : (
          <div className="text-center text-muted-foreground py-10">
            <p>{t("cookiesPreparing")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
`;

// Blog listing page
files["app/[locale]/(public)/blog/page.tsx"] = `"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, Calendar, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface BlogPost {
  _id: string;
  title: string;
  titleAr: string;
  slug: string;
  excerpt: string;
  excerptAr: string;
  coverImage: string;
  author: string;
  tags: string[];
  publishedAt: string;
}

export default function BlogListingPage() {
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const isAr = locale === "ar";
  const t = useTranslations("landing");

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 9;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search) params.set("search", search);

    fetch(\`/api/public/blogs?\${params}\`)
      .then((r) => r.json())
      .then((d) => {
        setPosts(d.data ?? []);
        setTotalPages(d.totalPages ?? 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, search]);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <div className="py-12">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold">{t("blogHeading")}</h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">{t("blogSubtitle")}</p>
        </div>

        <form onSubmit={handleSearch} className="relative max-w-md mx-auto mb-10">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchArticlesPlaceholder")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </form>

        {loading && (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}

        {!loading && posts.length === 0 && (
          <p className="text-center text-muted-foreground py-20">{t("noArticlesFound")}</p>
        )}

        {!loading && posts.length > 0 && (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <Link key={post._id} href={\`/\${locale}/blog/\${post.slug}\`} className="group">
                  <article className="rounded-xl border bg-card overflow-hidden h-full flex flex-col transition-shadow group-hover:shadow-md">
                    {post.coverImage ? (
                      <img src={post.coverImage} alt="" className="h-48 w-full object-cover" />
                    ) : (
                      <div className="h-48 bg-muted flex items-center justify-center">
                        <span className="text-4xl font-bold text-muted-foreground/30">M</span>
                      </div>
                    )}
                    <div className="p-5 flex-1 flex flex-col">
                      <h2 className="font-semibold text-lg group-hover:text-primary transition-colors line-clamp-2">
                        {isAr ? post.titleAr || post.title : post.title}
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-3 flex-1">
                        {isAr ? post.excerptAr || post.excerpt : post.excerpt}
                      </p>
                      <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground border-t pt-3">
                        {post.author && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {post.author}
                          </span>
                        )}
                        {post.publishedAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(post.publishedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {post.tags?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {post.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                </Link>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-10">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  {t("previousPage")}
                </Button>
                <span className="flex items-center px-3 text-sm text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  {t("nextPage")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
`;

// Blog detail page
files["app/[locale]/(public)/blog/[slug]/page.tsx"] = `"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Calendar, User, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Post {
  _id: string;
  title: string;
  titleAr: string;
  slug: string;
  body: string;
  bodyAr: string;
  coverImage: string;
  author: string;
  tags: string[];
  publishedAt: string;
}

export default function BlogDetailPage() {
  const pathname = usePathname();
  const parts = pathname.split("/");
  const locale = parts[1] || "en";
  const slug = parts[parts.length - 1];
  const isAr = locale === "ar";
  const t = useTranslations("landing");

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    fetch(\`/api/public/blogs/\${slug}\`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => d && setPost(d))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">{t("articleNotFoundHeading")}</h1>
        <Link href={\`/\${locale}/blog\`}>
          <Button variant="outline">{t("backToBlogLink")}</Button>
        </Link>
      </div>
    );
  }

  const title = isAr ? post.titleAr || post.title : post.title;
  const body = isAr ? post.bodyAr || post.body : post.body;

  return (
    <article className="py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <Link href={\`/\${locale}/blog\`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          {t("backToBlogLink")}
        </Link>

        {post.coverImage && (
          <img
            src={post.coverImage}
            alt={title}
            className="w-full rounded-xl object-cover max-h-[400px] mb-8"
          />
        )}

        <h1 className="text-3xl sm:text-4xl font-bold leading-tight">{title}</h1>

        <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground">
          {post.author && (
            <span className="flex items-center gap-1.5">
              <User className="h-4 w-4" />
              {post.author}
            </span>
          )}
          {post.publishedAt && (
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {new Date(post.publishedAt).toLocaleDateString(isAr ? "ar-SA" : "en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          )}
        </div>

        {post.tags?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {post.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
                <Tag className="h-3 w-3" />
                {tag}
              </span>
            ))}
          </div>
        )}

        <div
          className="mt-10 prose prose-neutral dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: body }}
        />
      </div>
    </article>
  );
}
`;

// Maintenance page
files["app/[locale]/maintenance/page.tsx"] = `import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  title: "Maintenance",
  robots: { index: false, follow: false },
};

export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  const t = await getTranslations("maintenance");

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4 text-center"
      dir={isAr ? "rtl" : "ltr"}
    >
      <div className="mx-auto max-w-md space-y-6">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
            />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-slate-900">{t("title")}</h1>
        <p className="text-lg text-slate-600">{t("subtitle")}</p>

        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          {t("adminHint")}
        </div>

        <Link
          href={\`/\${locale}/login\`}
          className="inline-block rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          {t("adminSignIn")}
        </Link>
      </div>

      <p className="mt-12 text-xs text-slate-400">
        &copy; {new Date().getFullYear()} MPLOYEDIN
      </p>
    </div>
  );
}
`;

// Register page
files["app/[locale]/(auth)/register/page.tsx"] = `"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { signIn, getSession } from "next-auth/react";
import { signInWithPopup } from "firebase/auth";
import { firebaseAuth, googleProvider } from "@/lib/firebase/client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function RegisterPage() {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const t = useTranslations("auth");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [linkedInLoading, setLinkedInLoading] = useState(false);

  async function handleGoogleSignIn() {
    setError("");
    setGoogleLoading(true);
    try {
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      const idToken = await result.user.getIdToken();

      const res = await signIn("firebase", { idToken, redirect: false });
      if (res?.error) {
        setError(t("googleSignInFailed"));
        return;
      }

      const session = await getSession();
      const role = (session?.user as Record<string, unknown>)?.role as string ?? "job_seeker";
      const isOnboarded = (session?.user as Record<string, unknown>)?.isOnboarded as boolean ?? false;
      if (!isOnboarded) {
        router.replace(\`/\${locale}/onboarding\`);
      } else {
        const redirects: Record<string, string> = { admin: "admin", employer: "employer", job_seeker: "job-seeker", agent: "agent", super_agent: "super-agent" };
        router.replace(\`/\${locale}/\${redirects[role] ?? "job-seeker"}\`);
      }
    } catch {
      setError(t("googleSignInFailed"));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(t("passwordsDoNotMatch"));
      return;
    }
    if (password.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/job-seeker-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.message ?? t("registrationFailed"));
      return;
    }

    router.push(\`/\${locale}/verify-email?email=\${encodeURIComponent(email)}\`);
  }

  return (
    <div className="w-full flex flex-col gap-8">
      <div className="lg:hidden flex flex-col gap-2">
        <div className="inline-flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
            <span className="font-bold text-base">M</span>
          </div>
          <span className="text-xl font-bold text-foreground tracking-tight">mployedin</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t("createYourAccount")}</h1>
        <p className="text-base text-muted-foreground font-light">{t("registerSubtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-medium">{t("fullName")}</Label>
          <Input
            id="name"
            type="text"
            placeholder={t("fullNamePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            className="h-11 px-4 bg-transparent transition-all focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/40 rounded-lg"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">{t("emailAddressLabel")}</Label>
          <Input
            id="email"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="h-11 px-4 bg-transparent transition-all focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/40 rounded-lg"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">{t("password")}</Label>
          <Input
            id="password"
            type="password"
            placeholder={t("minChars")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            className="h-11 px-4 bg-transparent transition-all focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/40 rounded-lg"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-sm font-medium">{t("confirmPassword")}</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder={t("confirmPasswordPlaceholder")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            className="h-11 px-4 bg-transparent transition-all focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/40 rounded-lg"
          />
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive text-center font-medium">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          className="w-full h-11 text-base font-medium shadow-sm transition-all rounded-lg"
          disabled={loading}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {t("createAccount")}
        </Button>
      </form>

      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-4 text-muted-foreground/60 font-medium tracking-wider">{t("orContinueWith")}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          type="button"
          className="h-11 bg-transparent hover:bg-muted/50 border-border font-medium transition-colors"
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
        >
          {googleLoading ? (
            <Loader2 className="w-5 h-5 mr-0.5 animate-spin" />
          ) : (
            <svg className="w-5 h-5 mr-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
          )}
          Google
        </Button>
        <Button
          variant="outline"
          type="button"
          className="h-11 bg-transparent hover:bg-muted/50 border-border font-medium transition-colors"
          onClick={() => { setLinkedInLoading(true); setError(""); signIn("linkedin", { callbackUrl: "/api/auth/post-login-redirect" }); }}
          disabled={linkedInLoading}
        >
          {linkedInLoading ? (
            <Loader2 className="w-5 h-5 mr-0.5 animate-spin" />
          ) : (
            <svg className="w-5 h-5 mr-0.5 fill-[#0A66C2]" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          )}
          LinkedIn
        </Button>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {t("alreadyHaveAccount")}{" "}
        <Link href={\`/\${locale}/login\`} className="text-primary hover:text-primary/80 font-semibold transition-colors">
          {t("signIn")}
        </Link>
      </p>

      <p className="text-center text-xs text-muted-foreground">
        {t("hiringQuestion")}{" "}
        <Link href={\`/\${locale}/employer-register\`} className="text-muted-foreground hover:text-foreground font-medium underline transition-colors">
          {t("registerAsEmployer")}
        </Link>
      </p>
    </div>
  );
}
`;

// Write all files
for (const [relPath, content] of Object.entries(files)) {
  const fullPath = path.join(srcBase, relPath);
  fs.writeFileSync(fullPath, content, "utf-8");
  console.log("OK " + relPath);
}

console.log("\nAll public pages, auth pages, and maintenance page rewritten with useTranslations!");
