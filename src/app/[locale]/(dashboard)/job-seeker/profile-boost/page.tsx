"use client";

import { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Rocket, Zap, Eye, TrendingUp, Clock } from "lucide-react";

export default function ProfileBoostPage() {
  const t = useTranslations("jobSeekerExtra.profileBoost");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const [isActive, setIsActive] = useState(false);
  const [boostedUntil, setBoostedUntil] = useState<string | null>(null);
  const [boostCount, setBoostCount] = useState(0);
  const [headline, setHeadline] = useState("");
  const [loading, setLoading] = useState(true);
  const [boosting, setBoosting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/job-seeker/profile-boost");
        if (res.ok) {
          const data = await res.json();
          setIsActive(data.isActive);
          setBoostedUntil(data.boostedUntil);
          setBoostCount(data.boostCount);
          setHeadline(data.headline ?? "");
        }
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleBoost = async () => {
    setBoosting(true);
    try {
      const res = await fetch("/api/job-seeker/profile-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headline: headline || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsActive(true);
        setBoostedUntil(data.boostedUntil);
        setBoostCount((c) => c + 1);
        toast.success(data.message);
      } else {
        const err = await res.json();
        toast.error(err.error ?? t("failed"));
      }
    } catch { toast.error(t("network")); } finally {
      setBoosting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-6">
        <div className="animate-pulse space-y-3 sm:space-y-4">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="h-48 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-2xl mx-auto space-y-3 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2 sm:text-2xl">
          <Rocket className="w-5 h-5 text-primary sm:w-6 sm:h-6" />
          {t("title")}
        </h1>
        <p className="text-xs text-muted-foreground mt-1 sm:text-sm">{t("description")}</p>
      </div>

      {/* Status Card */}
      <div className={`rounded-xl border ${isActive ? "border-primary bg-primary/5" : "border-border bg-card"} panel-body`}>
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl ${isActive ? "bg-primary/10" : "bg-muted"}`}>
            <Zap className={`w-8 h-8 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div>
            <h2 className="heading-section font-semibold text-foreground">
              {isActive ? t("active") : t("inactive")}
            </h2>
            {isActive && boostedUntil ? (
              <p className="text-sm text-muted-foreground">
                {t("activeUntil", { date: new Date(boostedUntil).toLocaleDateString(numberLocale), count: boostCount.toLocaleString(numberLocale) })}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("benefit")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bg-card border border-border rounded-xl text-center card-pad">
          <Eye className="w-6 h-6 text-blue-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">{t("viewsTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("viewsDescription")}</p>
        </div>
        <div className="bg-card border border-border rounded-xl text-center card-pad">
          <TrendingUp className="w-6 h-6 text-green-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">{t("matchingTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("matchingDescription")}</p>
        </div>
        <div className="bg-card border border-border rounded-xl text-center card-pad">
          <Clock className="w-6 h-6 text-purple-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">{t("daysTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("daysDescription")}</p>
        </div>
      </div>

      {/* Headline Update */}
      {!isActive && (
        <div className="bg-card border border-border rounded-xl space-y-3 panel-body">
          <label className="text-sm font-medium text-foreground">
            {t("headlineLabel")}
          </label>
          <input
            type="text"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            maxLength={150}
            placeholder={t("headlinePlaceholder")}
            className="w-full border border-border rounded-lg bg-background text-sm chip-pad"
          />
          <p className="text-xs text-muted-foreground">{headline.length}/150</p>
        </div>
      )}

      {/* Boost Button */}
      {!isActive && (
        <button
          onClick={handleBoost}
          disabled={boosting}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium text-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {boosting ? t("boosting") : (
            <>
              <Rocket className="w-5 h-5" />
              {t("boostButton")}
            </>
          )}
        </button>
      )}
    </div>
  );
}
