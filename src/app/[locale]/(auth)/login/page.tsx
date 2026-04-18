"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { signInWithPopup } from "firebase/auth";
import { firebaseAuth, googleProvider } from "@/lib/firebase/client";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const REMEMBER_ME_KEY = "mployedin_remember_email";
const ROLE_REDIRECTS: Record<string, string> = {
  admin: "admin",
  employer: "employer",
  job_seeker: "job-seeker",
  agent: "agent",
  super_agent: "super-agent",
};

function getPostSignInPath(locale: string, role: string, isOnboarded: boolean): string {
  if (role === "job_seeker" && !isOnboarded) {
    return `/${locale}/onboarding`;
  }

  return `/${locale}/${ROLE_REDIRECTS[role] ?? "job-seeker"}`;
}

export default function LoginPage() {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [linkedInLoading, setLinkedInLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem(REMEMBER_ME_KEY);
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }

    // Handle OAuth error query params
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError === "OAuthAccountNotLinked") {
      setError("This email is already registered with a different sign-in method. Please use your original sign-in method.");
    } else if (oauthError) {
      setError("Sign-in failed. Please try again.");
    }
  }, []);

  async function handleGoogleSignIn() {
    setError("");
    setGoogleLoading(true);
    try {
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      const idToken = await result.user.getIdToken();

      const res = await signIn("firebase", { idToken, redirect: false });
      if (res?.error) {
        setError("Google sign-in failed. Please try again.");
        return;
      }

      const sessionRes = await fetch("/api/auth/session");
      const session = await sessionRes.json();
      const role = (session?.user?.role as string) ?? "job_seeker";
      const isOnboarded = (session?.user?.isOnboarded as boolean) ?? true;
      router.push(getPostSignInPath(locale, role, isOnboarded));
    } catch {
      setError("Google sign-in failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (rememberMe) {
      localStorage.setItem(REMEMBER_ME_KEY, email);
    } else {
      localStorage.removeItem(REMEMBER_ME_KEY);
    }

    const result = await signIn("credentials", {
      email,
      password,
      rememberMe: rememberMe ? "true" : "false",
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password. Please try again.");
    } else {
      // Get session to determine role-based redirect
      const sessionRes = await fetch("/api/auth/session");
      const session = await sessionRes.json();
      const role = (session?.user?.role as string) ?? "job_seeker";
      const isOnboarded = (session?.user?.isOnboarded as boolean) ?? true;
      router.push(getPostSignInPath(locale, role, isOnboarded));
    }
  }

  return (
    <div className="w-full flex flex-col gap-8">
      <div className="lg:hidden flex flex-col gap-4">
        <Link
          href={`/${locale}`}
          className="inline-flex w-fit items-center"
        >
          <Image src="/logo.png" alt="Mployedin" width={156} height={40} className="h-9 w-auto object-contain" style={{ width: "auto" }} priority />
        </Link>
      </div>

      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[2.2rem]">
          Welcome back
        </h1>
        <p className="max-w-md text-base leading-7 text-muted-foreground font-light">
          Please enter your credentials to access your account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">Email address</Label>
          <Input
            id="email"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="h-12 rounded-xl border-border/70 bg-background/70 px-4 transition-all hover:border-primary/25 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm font-medium">Password</Label>
            <Link
              href={`/${locale}/forgot-password`}
              className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="h-12 rounded-xl border-border/70 bg-background/70 px-4 pr-11 transition-all hover:border-primary/25 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="remember-me"
            checked={rememberMe}
            onCheckedChange={(checked) => setRememberMe(checked === true)}
          />
          <Label htmlFor="remember-me" className="text-sm font-normal text-muted-foreground cursor-pointer select-none">
            Remember my email
          </Label>
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
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Sign in
        </Button>
      </form>

      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-4 text-muted-foreground/60 font-medium tracking-wider">or continue with</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
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
          onClick={() => { setLinkedInLoading(true); setError(""); signIn("linkedin", { callbackUrl: `/${locale}/onboarding` }); }}
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

      <p className="text-center text-sm text-muted-foreground mt-6">
        Don&apos;t have an account?{" "}
        <Link
          href={`/${locale}/register`}
          className="text-primary hover:text-primary/80 font-semibold transition-colors"
        >
          Create account
        </Link>
        {" · "}
        <Link
          href={`/${locale}/employer-register`}
          className="text-muted-foreground hover:text-foreground font-medium transition-colors text-xs"
        >
          Post jobs as employer
        </Link>
      </p>
    </div>
  );
}
