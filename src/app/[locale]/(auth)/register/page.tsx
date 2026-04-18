"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function RegisterPage() {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [linkedInLoading, setLinkedInLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
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
      setError(data.message ?? "Registration failed. Please try again.");
      return;
    }

    // Auto-sign in after registration, then go to onboarding
    const result = await signIn("credentials", { email, password, redirect: false });
    if (result?.error) {
      router.push(`/${locale}/login?registered=true`);
    } else {
      router.push(`/${locale}/onboarding`);
    }
  }

  return (
    <div className="w-full flex flex-col gap-8">
      {/* Mobile Logo */}
      <div className="lg:hidden flex flex-col gap-2">
        <div className="inline-flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
            <span className="font-bold text-base">M</span>
          </div>
          <span className="text-xl font-bold text-foreground tracking-tight">mployedin</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Create your account</h1>
        <p className="text-base text-muted-foreground font-light">
          Find your next opportunity with AI-powered matching.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-medium">Full Name</Label>
          <Input
            id="name"
            type="text"
            placeholder="John Smith"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            className="h-11 px-4 bg-transparent transition-all focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/40 rounded-lg"
          />
        </div>

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
            className="h-11 px-4 bg-transparent transition-all focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/40 rounded-lg"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            className="h-11 px-4 bg-transparent transition-all focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/40 rounded-lg"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="Repeat your password"
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
          Create Account
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
          className="h-11 bg-transparent hover:bg-muted/50 border-border font-medium transition-colors"
          onClick={() => signIn("google", { callbackUrl: `/${locale}/onboarding` })}
        >
          <svg className="w-5 h-5 mr-0.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Google
        </Button>
        <Button
          variant="outline"
          type="button"
          className="h-11 bg-transparent hover:bg-muted/50 border-border font-medium transition-colors"
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

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={`/${locale}/login`} className="text-primary hover:text-primary/80 font-semibold transition-colors">
          Sign in
        </Link>
      </p>

      <p className="text-center text-xs text-muted-foreground">
        Hiring?{" "}
        <Link href={`/${locale}/employer-register`} className="text-muted-foreground hover:text-foreground font-medium underline transition-colors">
          Register as an employer
        </Link>
      </p>
    </div>
  );
}
