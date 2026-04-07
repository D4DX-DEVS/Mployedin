"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useParams } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, Mail } from "lucide-react";

type Status = "idle" | "verifying" | "success" | "error" | "no-token";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const { locale } = useParams<{ locale: string }>();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>(token ? "verifying" : "no-token");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;

    const verify = async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (res.ok) {
          setStatus("success");
        } else {
          setStatus("error");
          setMessage(data.error ?? "Verification failed. The link may have expired.");
        }
      } catch {
        setStatus("error");
        setMessage("Network error. Please try again.");
      }
    };

    verify();
  }, [token]);

  return (
    <div className="w-full flex flex-col gap-8">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
          <span className="font-bold text-base">M</span>
        </div>
        <span className="text-xl font-bold text-foreground tracking-tight">mployedin</span>
      </div>

      {/* Verifying */}
      {status === "verifying" && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Loader2 className="h-7 w-7 text-primary animate-spin" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Verifying your email…</h1>
            <p className="text-base text-muted-foreground font-light">Just a moment, please wait.</p>
          </div>
        </div>
      )}

      {/* Success */}
      {status === "success" && (
        <div className="flex flex-col items-center gap-6 py-6 text-center">
          <div className="h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle className="h-7 w-7 text-green-600 dark:text-green-400" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Email verified!</h1>
            <p className="text-base text-muted-foreground font-light">
              Your email address has been confirmed. You can now access your dashboard.
            </p>
          </div>
          <Button asChild className="w-full max-w-xs h-11">
            <Link href={`/${locale ?? "en"}/login`}>Continue to sign in</Link>
          </Button>
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="flex flex-col items-center gap-6 py-6 text-center">
          <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <XCircle className="h-7 w-7 text-destructive" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Verification failed</h1>
            <p className="text-base text-muted-foreground font-light">
              {message || "This link is invalid or has already been used."}
            </p>
          </div>
          <div className="w-full max-w-xs space-y-3">
            <Button asChild variant="outline" className="w-full h-11">
              <Link href={`/${locale ?? "en"}/login`}>Back to sign in</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Need help?{" "}
              <Link href={`/${locale ?? "en"}/contact`} className="text-primary hover:underline">
                Contact support
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* No token — waiting for email */}
      {status === "no-token" && (
        <div className="flex flex-col items-center gap-6 py-6 text-center">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="h-7 w-7 text-primary" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
            <p className="text-base text-muted-foreground font-light">
              We sent a verification link to your email address. Click the link to activate your account.
            </p>
          </div>
          <div className="w-full max-w-xs p-4 rounded-xl bg-muted/50 border text-left space-y-2">
            <p className="text-sm font-medium text-foreground">Didn&apos;t receive it?</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>Check your spam or junk folder</li>
              <li>Make sure you used the correct email address</li>
              <li>Allow a few minutes for the email to arrive</li>
            </ul>
          </div>
          <Button
            variant="outline"
            className="w-full max-w-xs h-11"
            onClick={() => signOut({ callbackUrl: `/${locale ?? "en"}/login` })}
          >
            Back to sign in
          </Button>
        </div>
      )}
    </div>
  );
}
