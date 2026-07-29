"use client";

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
import { BriefcaseBusiness, Loader2, UserRoundSearch } from "lucide-react";

export default function RegisterPage() {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const t = useTranslations("auth");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [linkedInLoading, setLinkedInLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [roleSelected, setRoleSelected] = useState(false);

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
        router.replace(`/${locale}/onboarding`);
      } else {
        const redirects: Record<string, string> = { admin: "admin", employer: "employer", job_seeker: "job-seeker", agent: "agent", super_agent: "super-agent" };
        router.replace(`/${locale}/${redirects[role] ?? "job-seeker"}`);
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

    if (!agreedToTerms) {
      setError(t("mustAgreeToTerms"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("passwordsDoNotMatch"));
      return;
    }
    if (password.length < 12) {
      setError(t("passwordTooShort"));
      return;
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError(t("passwordTooWeak"));
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/job-seeker-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setLoading(false);
      setError(data.message ?? t("registrationFailed"));
      return;
    }

    // Account is created. Sign the user in straight away so they can complete
    // onboarding (details / CV parsing) first. Email verification is enforced
    // afterwards, when they try to reach the dashboard.
    const signInResult = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);

    if (signInResult?.error) {
      // Fallback: account exists but auto sign-in failed — send to login.
      router.push(`/${locale}/login?email=${encodeURIComponent(email)}`);
      return;
    }

    router.replace(`/${locale}/onboarding`);
  }

  if (!roleSelected) {
    return (
      <div className="flex w-full flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t("chooseAccountType")}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{t("chooseAccountTypeDescription")}</p>
        </div>

        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => setRoleSelected(true)}
            className="flex min-h-24 w-full items-center gap-4 rounded-2xl border border-primary/30 bg-primary/[0.06] p-4 text-start transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <UserRoundSearch className="h-6 w-6" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-foreground">{t("jobSeekerAccount")}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{t("jobSeekerAccountDescription")}</span>
            </span>
          </button>

          <Link
            href={`/${locale}/employer-register`}
            className="flex min-h-24 w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-start transition-colors hover:border-primary/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
              <BriefcaseBusiness className="h-6 w-6" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-foreground">{t("employerAccount")}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{t("employerAccountDescription")}</span>
            </span>
          </Link>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          {t("alreadyHaveAccount")}{" "}
          <Link href={`/${locale}/login`} className="inline-flex min-h-11 items-center font-semibold text-primary">
            {t("signIn")}
          </Link>
        </p>
      </div>
    );
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
        <button
          type="button"
          onClick={() => setRoleSelected(false)}
          className="mb-2 inline-flex min-h-11 items-center rounded-xl bg-primary/10 px-3 text-sm font-medium text-primary"
        >
          {t("jobSeekerAccount")} · {t("changeAccountType")}
        </button>
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
            className="h-12 px-4 rounded-xl border-border/70 bg-background/70 transition-all hover:border-primary/25 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15"
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
            className="h-12 px-4 rounded-xl border-border/70 bg-background/70 transition-all hover:border-primary/25 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15"
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
            className="h-12 px-4 rounded-xl border-border/70 bg-background/70 transition-all hover:border-primary/25 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15"
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
            className="h-12 px-4 rounded-xl border-border/70 bg-background/70 transition-all hover:border-primary/25 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15"
          />
        </div>

        <div className="flex min-h-11 items-start gap-3 rounded-xl p-1">
          <input
            id="terms"
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 rounded border-border text-primary focus:ring-primary/40"
          />
          <label htmlFor="terms" className="text-sm text-muted-foreground leading-5">
            {t("agreeToTerms")}{" "}
            <Link href={`/${locale}/terms`} className="text-primary hover:underline" target="_blank">
              {t("termsOfService")}
            </Link>
            {" "}{t("and")}{" "}
            <Link href={`/${locale}/privacy`} className="text-primary hover:underline" target="_blank">
              {t("privacyPolicyLink")}
            </Link>
          </label>
        </div>

        {error && (
          <div role="alert" className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive text-center font-medium">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          className="h-12 w-full rounded-xl text-base font-medium shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5"
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

      <div className="grid grid-cols-3 gap-3">
        <Button
          variant="outline"
          type="button"
          className="h-12 rounded-xl border-border/70 bg-background/60 font-medium transition-colors hover:bg-muted/60"
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
          className="h-12 rounded-xl border-border/70 bg-background/60 font-medium transition-colors hover:bg-muted/60"
          onClick={() => { setAppleLoading(true); setError(""); signIn("apple", { callbackUrl: "/api/auth/post-login-redirect" }); }}
          disabled={appleLoading}
        >
          {appleLoading ? (
            <Loader2 className="w-5 h-5 mr-0.5 animate-spin" />
          ) : (
            <svg className="w-5 h-5 mr-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
          )}
          Apple
        </Button>
        <Button
          variant="outline"
          type="button"
          className="h-12 rounded-xl border-border/70 bg-background/60 font-medium transition-colors hover:bg-muted/60"
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
        <Link href={`/${locale}/login`} className="text-primary hover:text-primary/80 font-semibold transition-colors">
          {t("signIn")}
        </Link>
      </p>

      <p className="text-center text-xs text-muted-foreground">
        {t("hiringQuestion")}{" "}
        <Link href={`/${locale}/employer-register`} className="text-muted-foreground hover:text-foreground font-medium underline transition-colors">
          {t("registerAsEmployer")}
        </Link>
      </p>
    </div>
  );
}
