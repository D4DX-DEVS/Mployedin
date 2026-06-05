"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Loader2, MapPin, BriefcaseBusiness } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { getLocalizedCountryName } from "@/lib/i18n/locations";

interface MatchPreviewPanelProps {
  skills: string[];
  country: string;
  experienceMin: number;
  experienceMax: number;
}

interface MatchData {
  count: number;
  topSkills: string[];
}

export function MatchPreviewPanel({
  skills,
  country,
  experienceMin,
  experienceMax,
}: MatchPreviewPanelProps) {
  const t = useTranslations("employerJobForm.matchPreview");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const [data, setData] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getCountryLabel = (countryName: string) => {
    return getLocalizedCountryName(countryName, locale, {
      remoteGlobalLabel: t("remoteGlobal"),
    });
  };

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    // Only fetch when there's something meaningful to query
    if (skills.length === 0 && !country) {
      setData(null);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (skills.length > 0) params.set("skills", skills.slice(0, 15).join(","));
        if (country) params.set("country", country);
        if (experienceMin > 0) params.set("experienceMin", String(experienceMin));
        if (experienceMax > 0) params.set("experienceMax", String(experienceMax));

        const res = await fetch(`/api/jobs/match-preview?${params.toString()}`);
        if (res.ok) {
          const json = (await res.json()) as MatchData;
          setData(json);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }, 700);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [skills, country, experienceMin, experienceMax]);

  if (!data && !loading) return null;

  const activeFilters = [
    country ? t("locationFilter", { country: getCountryLabel(country) }) : null,
    skills.length > 0
      ? t("skillsFilter", { count: Math.min(skills.length, 15).toLocaleString(numberLocale) })
      : null,
    experienceMax > 0
      ? t("experienceFilter", {
        min: experienceMin.toLocaleString(numberLocale),
        max: experienceMax.toLocaleString(numberLocale),
      })
      : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-gradient-to-br from-background via-background to-secondary/60 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Users className="w-4 h-4 text-primary" />
            {t("title")}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeFilters.map((filter) => (
            <Badge key={filter} variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
              {filter}
            </Badge>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        {data && !loading && (
          <motion.div
            key={`${data.count}-${data.topSkills.join(",")}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <div className="rounded-2xl border border-border/70 bg-background/80 p-3.5">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <BriefcaseBusiness className="h-3.5 w-3.5" />
                {t("talentPoolSize")}
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-foreground tabular-nums">
                  ~{data.count.toLocaleString(numberLocale)}
                </span>
                <span className="ms-2 text-sm text-muted-foreground">
                  {t("matchingCandidates")}
                </span>
              </div>
            </div>

            {data.topSkills.length > 0 && (
              <div className="space-y-1.5 rounded-2xl border border-border/70 bg-background/80 p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {t("commonSkills")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.topSkills.slice(0, 4).map((skill) => (
                    <Badge key={skill} variant="secondary" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {t("estimate")}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
