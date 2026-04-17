"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, CheckCircle2, Eye, EyeOff } from "lucide-react";

function getStrength(password: string): number {
  return [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
}

const STRENGTH_LABELS = ["Very Weak", "Weak", "Good", "Strong"] as const;
const STRENGTH_COLORS = ["bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-green-500"] as const;

export default function ResetPasswordPage() {
  const { locale } = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const strength = password.length > 0 ? getStrength(password) : 0;
  const showStrength = password.length > 0;

  useEffect(() => {
    if (confirmPassword && password !== confirmPassword) {
      setMatchError("Passwords do not match");
    } else {
      setMatchError("");
    }
  }, [password, confirmPassword]);

  const isSubmitDisabled =
    loading ||
    !token ||
    strength < 2 ||
    (!!confirmPassword && password !== confirmPassword);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 429) {
          setError("Too many requests. Please wait a few minutes and try again.");
        } else {
          setError(data?.error ?? "Something went wrong. Please try again.");
        }
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="w-full flex flex-col gap-8">
        <div className="flex flex-col items-center text-center gap-4 py-8">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-primary" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Password reset successful
            </h1>
            <p className="text-base text-muted-foreground font-light max-w-xs mx-auto">
              Your password has been updated. You can now sign in with your new password.
            </p>
          </div>
        </div>

        <Link href={`/${locale}/login`}>
          <Button className="w-full h-11 text-base font-medium shadow-sm transition-all rounded-lg">
            Sign in
          </Button>
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="w-full flex flex-col gap-8">
        <div className="space-y-1.5">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Invalid reset link
          </h1>
          <p className="text-base text-muted-foreground font-light">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
        </div>

        <Link href={`/${locale}/forgot-password`}>
          <Button className="w-full h-11 text-base font-medium shadow-sm transition-all rounded-lg">
            Request new reset link
          </Button>
        </Link>

        <div className="text-center">
          <Link
            href={`/${locale}/login`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-8">
      <div className="space-y-1.5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Set new password
        </h1>
        <p className="text-base text-muted-foreground font-light">
          Choose a strong password with at least 8 characters.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">New password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="h-11 px-4 pr-11 bg-transparent transition-all focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/40 rounded-lg"
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

          {showStrength && (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      strength >= level ? STRENGTH_COLORS[strength - 1] : "bg-muted"
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Strength:{" "}
                <span className="font-medium text-foreground">
                  {STRENGTH_LABELS[strength - 1] ?? "Very Weak"}
                </span>
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirm ? "text" : "password"}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="h-11 px-4 pr-11 bg-transparent transition-all focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/40 rounded-lg"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showConfirm ? "Hide password" : "Show password"}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {matchError && (
            <p className="text-xs text-destructive font-medium">{matchError}</p>
          )}
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive text-center font-medium">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          className="w-full h-11 text-base font-medium shadow-sm transition-all rounded-lg"
          disabled={isSubmitDisabled}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Reset password
        </Button>
      </form>

      <div className="text-center">
        <Link
          href={`/${locale}/login`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
