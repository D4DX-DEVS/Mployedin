"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ShieldCheck, Calendar, Building2, Mail, MapPin } from "lucide-react";

export default function GdprPage() {
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const isAr = locale === "ar";
  const t = useTranslations("landing");

  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/public/pages/gdpr")
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((d) => {
        const p = d?.page ?? d;
        if (p) {
          setBody(isAr ? p.bodyAr || p.body : p.body);
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
    <div className="bg-muted/30 min-h-[80vh] py-14">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Hero header */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">{t("gdprHeading")}</h1>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            {t("gdprSubheading")}
          </p>
          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>{isAr ? "آخر تحديث: ٩ يونيو ٢٠٢٣" : "Last Updated: 9th June 2023"}</span>
          </div>
        </div>

        {body ? (
          <div className="rounded-2xl border border-border/60 bg-background shadow-sm">
            {/* Intro banner */}
            <div className="border-b border-border/60 bg-muted/40 px-6 py-5 rounded-t-2xl sm:px-8">
              <p className="text-sm leading-relaxed text-muted-foreground text-justify">
                {isAr
                  ? "يوضح هذا المستند سياسات حماية البيانات وإجراءات الامتثال للائحة العامة لحماية البيانات (GDPR) وقانون حماية البيانات 2018 في المملكة المتحدة التي تطبقها شركة MPLOYEDIN UK LTD."
                  : "This document outlines the data protection policies and GDPR compliance procedures implemented by MPLOYEDIN UK LTD in accordance with applicable laws in the United Kingdom, including the General Data Protection Regulation (GDPR) and the Data Protection Act 2018."}
              </p>
            </div>

            {/* Body content */}
            <div
              className="prose prose-neutral dark:prose-invert max-w-none px-6 py-8 sm:px-8 prose-headings:scroll-mt-20 prose-h2:text-xl prose-h2:font-semibold prose-h2:border-b prose-h2:border-border/40 prose-h2:pb-3 prose-h2:mb-4 prose-h3:text-lg prose-p:text-justify prose-p:leading-7 prose-li:leading-7"
              dangerouslySetInnerHTML={{ __html: body }}
            />

            {/* Contact footer card */}
            <div className="border-t border-border/60 bg-muted/40 px-6 py-6 rounded-b-2xl sm:px-8">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                {isAr ? "اتصل بنا" : "Contact Us"}
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background p-4">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm text-foreground leading-5">MPLOYEDIN UK LTD</span>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background p-4">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm text-foreground leading-5">X2 Greenleaf Walk, Southall, UB1 1FR</span>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background p-4">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <a href="mailto:support@mployedin.com" className="text-sm text-primary hover:underline">
                    support@mployedin.com
                  </a>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-10">
            <p>{t("gdprPreparing")}</p>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {isAr
            ? "باستخدامك لموقعنا، فإنك تقر وتوافق على شروط سياسة حماية البيانات هذه."
            : "By using our website, you acknowledge and agree to the terms of this Data Protection Policy."}
        </p>
      </div>
    </div>
  );
}
