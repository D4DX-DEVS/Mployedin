"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, MailQuestion } from "lucide-react";

type Status = "verifying" | "success" | "error" | "no-token";

export default function ConfirmEmailChangePage() {
  const t = useTranslations("confirmEmailChange");
  const searchParams = useSearchParams();
  const { locale } = useParams<{ locale: string }>();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>(token ? "verifying" : "no-token");
  const [message, setMessage] = useState("");
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    if (!token) return;

    const confirm = async () => {
      try {
        const res = await fetch("/api/auth/confirm-email-change", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (res.ok) {
          setNewEmail(data.email ?? "");
          setStatus("success");
        } else {
          setStatus("error");
          setMessage(data.error ?? t("confirmationFailedFallback"));
        }
      } catch {
        setStatus("error");
        setMessage(t("networkError"));
      }
    };

    confirm();
  }, [token, t]);

  return (
    <div className="w-full flex flex-col gap-8">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
          <span className="font-bold text-base">M</span>
        </div>
        <span className="text-xl font-bold text-foreground tracking-tight">mployedin</span>
      </div>

      {status === "verifying" && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Loader2 className="h-7 w-7 text-primary animate-spin" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{t("confirmingTitle")}</h1>
            <p className="text-base text-muted-foreground font-light">{t("pleaseWait")}</p>
          </div>
        </div>
      )}

      {status === "success" && (
        <div className="flex flex-col items-center gap-6 py-6 text-center">
          <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="h-7 w-7 text-green-600" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{t("emailUpdatedTitle")}</h1>
            <p className="text-base text-muted-foreground font-light">
              {t("emailNowPrefix")}{newEmail ? <> <strong className="font-medium text-foreground">{newEmail}</strong></> : ` ${t("updatedWord")}`}.
              {" "}{t("useItNextTime")}
            </p>
          </div>
          <Button size="lg" asChild className="w-full max-w-xs">
            <Link href={`/${locale ?? "en"}/login`}>{t("continueToSignIn")}</Link>
          </Button>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center gap-6 py-6 text-center">
          <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <XCircle className="h-7 w-7 text-destructive" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{t("confirmationFailedTitle")}</h1>
            <p className="text-base text-muted-foreground font-light">{message}</p>
          </div>
          <Button size="lg" asChild variant="outline" className="w-full max-w-xs">
            <Link href={`/${locale ?? "en"}/login`}>{t("backToSignIn")}</Link>
          </Button>
        </div>
      )}

      {status === "no-token" && (
        <div className="flex flex-col items-center gap-6 py-6 text-center">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
            <MailQuestion className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{t("missingLinkTitle")}</h1>
            <p className="text-base text-muted-foreground font-light">
              {t("missingLinkBody")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
