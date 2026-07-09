"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("forgotPasswordPage");
  const BackIcon = locale === "ar" ? ArrowRight : ArrowLeft;
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok && res.status !== 429) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? t("somethingWentWrong"));
      } else if (res.status === 429) {
        setError(t("tooManyRequests"));
      } else {
        setSubmitted(true);
      }
    } catch {
      setError(t("networkError"));
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="w-full flex flex-col gap-8">
        <div className="lg:hidden flex flex-col gap-2">
          <div className="inline-flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
              <span className="font-bold text-base">M</span>
            </div>
            <span className="text-xl font-bold text-foreground tracking-tight">
              mployedin
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center text-center gap-4 py-8">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-primary" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {t("checkEmailTitle")}
            </h1>
            <p className="text-base text-muted-foreground font-light max-w-xs mx-auto">
              {t("checkEmailDescription", { email })}
            </p>
          </div>
        </div>

        <Link href={`/${locale}/login`}>
          <Button variant="outline" className="w-full h-11 font-medium rounded-lg">
            <BackIcon className="w-4 h-4 me-2" />
            {t("backToSignIn")}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-8">
      {/* Mobile Logo & Header */}
      <div className="lg:hidden flex flex-col gap-2">
        <div className="inline-flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
            <span className="font-bold text-base">M</span>
          </div>
          <span className="text-xl font-bold text-foreground tracking-tight">
            mployedin
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="text-base text-muted-foreground font-light">
          {t("description")}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">{t("emailAddress")}</Label>
          <Input
            id="email"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="h-12 px-4 rounded-xl border-border/70 bg-background/70 transition-all hover:border-primary/25 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15"
          />
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive text-center font-medium">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          className="h-12 w-full rounded-xl text-base font-medium shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5"
          disabled={loading}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin me-2" />}
          {t("sendResetLink")}
        </Button>
      </form>

      <div className="text-center">
        <Link
          href={`/${locale}/login`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <BackIcon className="w-3.5 h-3.5" />
          {t("backToSignIn")}
        </Link>
      </div>
    </div>
  );
}
