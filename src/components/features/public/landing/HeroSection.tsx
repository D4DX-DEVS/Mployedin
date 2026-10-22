"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Search, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { parseJobSentence } from "@/lib/public/parseJobSentence";
import type { Audience } from "./types";

interface HeroSectionProps {
  locale: string;
  audience: Audience;
  onAudienceChange: (audience: Audience) => void;
}

type FilterKind = "search" | "location";

/**
 * The artifact's centred search hero. The visitor writes a sentence; plain rules
 * (no model) read a role and a place out of it, shown as chips they can remove
 * before opening the jobs list.
 */
export function HeroSection({ locale, audience, onAudienceChange }: HeroSectionProps) {
  const t = useTranslations("landing");
  const router = useRouter();
  const isSeeker = audience === "jobSeeker";
  const [sentence, setSentence] = useState("");
  const [removed, setRemoved] = useState<Set<FilterKind>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const parsed = useMemo(() => parseJobSentence(sentence), [sentence]);
  const filters = {
    search: removed.has("search") ? "" : parsed.search,
    location: removed.has("location") ? "" : parsed.location,
  };
  const chips: { kind: FilterKind; label: string }[] = [
    ...(filters.search ? [{ kind: "search" as const, label: t("chipRole", { value: filters.search }) }] : []),
    ...(filters.location ? [{ kind: "location" as const, label: t("chipLocation", { value: filters.location }) }] : []),
  ];

  const examples = [t("sentenceExampleOne"), t("sentenceExampleTwo"), t("sentenceExampleThree")];

  const edit = (value: string) => {
    setSentence(value);
    setRemoved(new Set());
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.location) params.set("location", filters.location);
    // Chips the visitor removed must not come back, so a sentence with nothing left opens the plain list.
    router.push(params.size > 0 ? `/${locale}/jobs?${params.toString()}` : `/${locale}/jobs`);
  };

  return (
    <section id="top" className="relative border-b border-border/60 bg-[radial-gradient(circle_at_12%_8%,hsl(var(--brand-blue-pale))_0%,transparent_34%),radial-gradient(circle_at_88%_72%,hsl(var(--brand-cyan)/0.12)_0%,transparent_30%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--surface-2))_100%)]">
      <div className="container relative mx-auto flex max-w-4xl flex-col items-center gap-5 px-4 py-12 text-center sm:px-6 lg:py-16">
        <div className="inline-flex rounded-full border border-border/70 bg-card/90 p-1 shadow-sm" role="group" aria-label={t("audienceLabel")}>
          {(["jobSeeker", "employer"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onAudienceChange(value)}
              aria-pressed={audience === value}
              className={`min-h-11 rounded-full px-5 text-sm font-semibold transition-all ${
                audience === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(value)}
            </button>
          ))}
        </div>

        {isSeeker ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t("searchBadge")}
          </span>
        ) : (
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t("heroEyebrow")}</p>
        )}

        <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-[-0.03em] text-foreground sm:text-5xl lg:text-[3.5rem] lg:leading-[1.06]">
          {isSeeker ? t("searchHeroTitle") : t("employerHeroTitle")}
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          {isSeeker ? t("searchHeroDescription") : t("employerHeroDescription")}
        </p>

        {isSeeker ? (
          <div className="w-full max-w-3xl text-start">
            <form onSubmit={submit} role="search" className="hero-search-field flex flex-col gap-3 rounded-3xl border border-border/70 bg-card p-3.5 shadow-[0_16px_40px_-24px_hsl(var(--brand-blue)/0.45)]">
              <label className="block">
                <span className="sr-only">{t("sentenceLabel")}</span>
                <textarea
                  ref={textareaRef}
                  rows={2}
                  value={sentence}
                  maxLength={200}
                  onChange={(event) => edit(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={t("sentencePlaceholder")}
                  className="w-full resize-none bg-transparent px-2 py-1.5 text-base leading-6 text-foreground placeholder:text-muted-foreground/80 sm:text-lg"
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {examples.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => {
                        edit(example);
                        textareaRef.current?.focus();
                      }}
                      className="min-h-10 rounded-full border border-border/70 bg-muted/40 px-3.5 text-xs font-semibold text-foreground/80 transition-colors hover:border-primary/30 hover:text-primary"
                    >
                      {example}
                    </button>
                  ))}
                </div>
                <Button type="submit" size="lg" className="gap-2 rounded-xl font-bold">
                  <Search className="h-4 w-4" aria-hidden="true" />
                  {t("findJobs2")}
                </Button>
              </div>
            </form>

            <div className="mt-4 flex flex-col gap-3" aria-live="polite">
              {chips.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground">{t("understood")}</span>
                  {chips.map((chip) => (
                    <span key={chip.kind} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-primary bg-primary/10 ps-3 pe-1 text-xs font-bold text-primary">
                      {chip.label}
                      <button
                        type="button"
                        onClick={() => {
                          setRemoved((current) => new Set(current).add(chip.kind));
                          // The button unmounts with its chip; keep keyboard focus in the form.
                          textareaRef.current?.focus();
                        }}
                        aria-label={t("removeFilter", { label: chip.label })}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-primary/15"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t("searchNote")}</p>
            </div>
          </div>
        ) : (
          <div className="flex w-full max-w-xl flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={`/${locale}/employer-register`} className="w-full sm:w-auto">
              <Button size="lg" className="w-full min-w-44 rounded-xl">{t("startHiring")}</Button>
            </Link>
            <Link href={`/${locale}/login`} className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full min-w-44 rounded-xl">{t("employerSignIn")}</Button>
            </Link>
          </div>
        )}

        <ul className="mt-1 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {[t("liveOpportunities"), t("verifiedEmployers"), t("directApplications")].map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
