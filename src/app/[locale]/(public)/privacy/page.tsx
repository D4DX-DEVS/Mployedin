"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";

export default function PrivacyPolicyPage() {
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const isAr = locale === "ar";
  const t = (en: string, ar: string) => (isAr ? ar : en);

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
          <h1 className="text-4xl font-bold">{t("Privacy Policy", "سياسة الخصوصية")}</h1>
        </div>

        {body ? (
          <div
            className="prose prose-neutral dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: body }}
          />
        ) : (
          <div className="text-center text-muted-foreground py-10">
            <p>{t("Privacy policy content is being prepared.", "محتوى سياسة الخصوصية قيد الإعداد.")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
