"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
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
  const t = (en: string, ar: string) => (isAr ? ar : en);

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
        {/* Header */}
        <div className="text-center mb-12">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HelpCircle className="h-7 w-7" />
          </div>
          <h1 className="text-4xl font-bold">
            {t("Frequently Asked Questions", "الأسئلة الشائعة")}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {t(
              "Find answers to common questions about MPLOYEDIN",
              "ابحث عن إجابات للأسئلة الشائعة حول مبلويدين"
            )}
          </p>
        </div>

        {/* Category Tabs */}
        {categories.length > 2 && (
          <div className="flex flex-wrap gap-2 mb-8 justify-center">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {cat === "all" ? t("All", "الكل") : cat}
              </button>
            ))}
          </div>
        )}

        {/* FAQ List */}
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">
            {t("No FAQs found.", "لم يتم العثور على أسئلة.")}
          </p>
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
