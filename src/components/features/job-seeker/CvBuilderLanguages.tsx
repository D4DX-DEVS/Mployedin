"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { LanguageLevel, SpokenLanguage } from "./cv-wizard/types";



interface CvBuilderLanguagesProps {
  languages: SpokenLanguage[];
  onChange: (next: SpokenLanguage[]) => void;
}

const COMMON_LANGUAGES = ["English", "Arabic", "Hindi", "Urdu", "Malayalam", "Tamil", "Bengali", "Tagalog", "French", "Nepali"];
const LEVELS: LanguageLevel[] = ["basic", "conversational", "professional", "native"];

/** Tap-to-pick languages with a level each, for the guided CV builder. */
export function CvBuilderLanguages({ languages, onChange }: CvBuilderLanguagesProps) {
  const t = useTranslations("cvWizard");
  const [otherLanguage, setOtherLanguage] = useState("");
  const setLanguages = (update: (list: SpokenLanguage[]) => SpokenLanguage[]) => onChange(update(languages));
  const toggleLanguage = (language: string) =>
    setLanguages((list) =>
      list.some((l) => l.language === language)
        ? list.filter((l) => l.language !== language)
        : [...list, { language, proficiency: "conversational" }],
    );

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {[...COMMON_LANGUAGES, ...languages.map((l) => l.language).filter((l) => !COMMON_LANGUAGES.includes(l))].map((lang) => {
          const on = languages.some((l) => l.language === lang);
          return (
            <button
              key={lang}
              type="button"
              aria-pressed={on}
              onClick={() => toggleLanguage(lang)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm",
                on ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 text-gray-700 hover:border-blue-400",
              )}
            >
              {on && <Check className="h-3.5 w-3.5" />} {lang}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Input
          value={otherLanguage}
          onChange={(e) => setOtherLanguage(e.target.value)}
          placeholder={t("languages.other")}
          maxLength={40}
          onKeyDown={(e) => {
            if (e.key === "Enter" && otherLanguage.trim()) {
              e.preventDefault();
              if (!languages.some((l) => l.language.toLowerCase() === otherLanguage.trim().toLowerCase())) toggleLanguage(otherLanguage.trim());
              setOtherLanguage("");
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!otherLanguage.trim()}
          onClick={() => {
            if (!languages.some((l) => l.language.toLowerCase() === otherLanguage.trim().toLowerCase())) toggleLanguage(otherLanguage.trim());
            setOtherLanguage("");
          }}
        >
          {t("languages.add")}
        </Button>
      </div>
      {languages.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-800">{t("languages.howWell")}</p>
          {languages.map((l) => (
            <div key={l.language} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{l.language}</span>
              <Select
                value={l.proficiency}
                onValueChange={(v) => setLanguages((list) => list.map((x) => (x.language === l.language ? { ...x, proficiency: v as LanguageLevel } : x)))}
              >
                <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEVELS.map((lv) => <SelectItem key={lv} value={lv}>{t(`languages.level.${lv}`)}</SelectItem>)}
                </SelectContent>
              </Select>
              <button type="button" aria-label={t("languages.removeOne", { language: l.language })} onClick={() => toggleLanguage(l.language)} className="text-gray-400 hover:text-red-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
