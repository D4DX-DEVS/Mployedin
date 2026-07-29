"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { CheckCircle2, Loader2, XCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

type AcceptState =
  | { phase: "loading" }
  | { phase: "success"; companyName: string }
  | { phase: "error"; message: string };

function AcceptInviteInner() {
  const t = useTranslations("employerTeam.accept");
  const { locale } = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<AcceptState>({ phase: "loading" });
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    if (!token) {
      setState({ phase: "error", message: t("missingToken") });
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/employers/team/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState({ phase: "error", message: data.error ?? t("genericError") });
          return;
        }
        setState({ phase: "success", companyName: data.companyName ?? "" });
      } catch {
        setState({ phase: "error", message: t("genericError") });
      }
    })();
  }, [token, t]);

  return (
    <div className="page-container flex items-center justify-center min-h-[60vh]">
      <div className="card-base p-8 max-w-md w-full text-center space-y-3 sm:space-y-4">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          {state.phase === "loading" && <Loader2 className="h-7 w-7 text-primary animate-spin" />}
          {state.phase === "success" && <CheckCircle2 className="h-7 w-7 text-emerald-600" />}
          {state.phase === "error" && <XCircle className="h-7 w-7 text-red-500" />}
        </div>

        {state.phase === "loading" && (
          <>
            <h1 className="text-lg font-semibold">{t("accepting")}</h1>
            <p className="text-sm text-muted-foreground">{t("acceptingDescription")}</p>
          </>
        )}

        {state.phase === "success" && (
          <>
            <h1 className="text-lg font-semibold">{t("successTitle")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("successDescription", { companyName: state.companyName })}
            </p>
            <Link href={`/${locale}/employer`}>
              <Button className="mt-2">
                <Users className="h-4 w-4 me-2" />
                {t("goToDashboard")}
              </Button>
            </Link>
          </>
        )}

        {state.phase === "error" && (
          <>
            <h1 className="text-lg font-semibold">{t("errorTitle")}</h1>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            <p className="text-xs text-muted-foreground">{t("errorHint")}</p>
            <Link href={`/${locale}/employer`}>
              <Button variant="outline" className="mt-2">{t("goToDashboard")}</Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteInner />
    </Suspense>
  );
}
