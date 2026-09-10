"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Loader2, Eye, EyeOff, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validatePasswordForForm } from "@/lib/security/passwordPolicy";

/**
 * Where an invited colleague sets their own password and joins.
 *
 * This page lives in the (auth) group, not the dashboard, because the person
 * arriving here has no session and no account. Under the dashboard the layout
 * would bounce them to login and the invite token in the query string would be
 * lost, which is exactly what used to happen.
 *
 * It never asks for company details. The colleague is joining somebody else's
 * company, so there is nothing for them to set up.
 */

interface InvitePreview {
  email: string;
  companyName: string;
  hasAccount: boolean;
}

function JoinTeamForm() {
  const t = useTranslations("teamJoin");
  // The password policy formats its own sentences from the shared formErrors
  // namespace, so the rules stay identical to every other password field.
  const tErrors = useTranslations("formErrors");
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const token = useSearchParams().get("token") ?? "";

  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError(t("missingToken"));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/employers/team/join?token=${encodeURIComponent(token)}`);
        const data = (await res.json().catch(() => ({}))) as Partial<InvitePreview> & {
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error ?? t("genericError"));
          return;
        }
        setInvite({
          email: data.email ?? "",
          companyName: data.companyName ?? "",
          hasAccount: Boolean(data.hasAccount),
        });
      } catch {
        if (!cancelled) setLoadError(t("genericError"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const passwordProblem = validatePasswordForForm(password, { locale, t: tErrors });
    if (passwordProblem) {
      setError(passwordProblem);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/employers/team/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { email?: string; error?: string };
      if (!res.ok) {
        // The server's sentence is shown as written. Rewriting it here is what
        // the error-copy guard exists to stop.
        setError(data.error ?? t("genericError"));
        return;
      }

      const result = await signIn("credentials", {
        email: data.email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError(t("signInFailed"));
        return;
      }
      router.push(`/${locale}/employer`);
    } catch {
      setError(t("genericError"));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="w-full flex flex-col gap-8">
        <div className="flex flex-col items-center text-center gap-4 py-8">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <XCircle className="w-6 h-6 text-red-600" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {t("problemTitle")}
            </h1>
            <p className="text-base text-muted-foreground font-light max-w-xs mx-auto">
              {loadError}
            </p>
          </div>
          <Link href={`/${locale}/login`}>
            <Button size="lg" variant="outline" className="rounded-lg">
              {t("goToSignIn")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="w-full flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label={t("loading")} />
      </div>
    );
  }

  // They already have an account, so there is no password to choose. Send them
  // to sign in; the accept link then completes the membership.
  if (invite.hasAccount) {
    return (
      <div className="w-full flex flex-col gap-8">
        <div className="flex flex-col items-center text-center gap-4 py-8">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {t("alreadyHaveAccountTitle")}
            </h1>
            <p className="text-base text-muted-foreground font-light max-w-sm mx-auto">
              {t("alreadyHaveAccountBody", { email: invite.email })}
            </p>
          </div>
          <Link
            href={`/${locale}/login?callbackUrl=${encodeURIComponent(
              `/${locale}/employer/team/accept?token=${token}`
            )}`}
          >
            <Button size="lg" className="rounded-lg">
              {t("goToSignIn")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-8">
      <div className="space-y-1.5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
        <p className="text-base text-muted-foreground font-light">
          {t("subtitle", { company: invite.companyName })}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="join-email">{t("emailLabel")}</Label>
          <Input id="join-email" type="email" value={invite.email} readOnly disabled />
          <p className="text-xs text-muted-foreground">{t("emailHint")}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="join-name">{t("nameLabel")}</Label>
          <Input
            id="join-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            placeholder={t("namePlaceholder")}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="join-password">{t("passwordLabel")}</Label>
          <div className="relative">
            <Input
              id="join-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="pe-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
              className="absolute inset-y-0 end-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={busy}
          className="w-full text-base font-medium shadow-sm transition-all rounded-lg"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 me-2 animate-spin" />
              {t("submitting")}
            </>
          ) : (
            t("submit")
          )}
        </Button>
      </form>
    </div>
  );
}

export default function JoinTeamPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <JoinTeamForm />
    </Suspense>
  );
}
