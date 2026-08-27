"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { X, Plus, Sparkles, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

export interface Skill {
  name: string;
  level?: "beginner" | "intermediate" | "advanced" | "expert";
  verified?: boolean;
}

interface SkillsChipsProps {
  value: Skill[];
  onChange: (skills: Skill[]) => void;
  maxSkills?: number;
  showLevels?: boolean;
  enableAISuggest?: boolean;
  /** Context for AI suggestions, e.g. current job title */
  profileContext?: string;
  placeholder?: string;
  label?: string;
}

const LEVEL_COLORS: Record<string, string> = {
  beginner: "bg-gray-100 text-gray-600",
  intermediate: "bg-blue-100 text-blue-700",
  advanced: "bg-purple-100 text-purple-700",
  expert: "bg-amber-100 text-amber-700",
};

const LEVEL_OPTIONS = ["beginner", "intermediate", "advanced", "expert"] as const;

/**
 * Interactive skill chips component with:
 * - Free-type + Enter to add
 * - Click chip to cycle through levels
 * - Delete chip with × or Backspace
 * - AI suggest button (calls /api/ai/chat for skill recommendations)
 */
export function SkillsChips({
  value,
  onChange,
  maxSkills = 30,
  showLevels = true,
  enableAISuggest = false,
  profileContext = "",
  placeholder = "Type a skill and press Enter…",
  label,
}: SkillsChipsProps) {
  const t = useTranslations("common");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const [input, setInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addSkill = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || value.length >= maxSkills) return;
    if (value.some(s => s.name.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...value, { name: trimmed, level: "intermediate" }]);
    setInput("");
  };

  const removeSkill = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const cycleLevel = (index: number) => {
    const current = value[index].level ?? "intermediate";
    const idx = LEVEL_OPTIONS.indexOf(current as typeof LEVEL_OPTIONS[number]);
    const next = LEVEL_OPTIONS[(idx + 1) % LEVEL_OPTIONS.length];
    const updated = [...value];
    updated[index] = { ...updated[index], level: next };
    onChange(updated);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill(input);
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      removeSkill(value.length - 1);
    }
  };

  const getAISuggestions = async () => {
    setAiLoading(true);
    try {
      const existingSkills = value.map(s => s.name).join(", ");
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: [
              `I am a Gulf job seeker${profileContext ? ` — ${profileContext}` : ""}.`,
              `My current skills: ${existingSkills || "none yet"}.`,
              `Suggest 8 additional skills that would make me more competitive in the Gulf market.`,
              `Return ONLY a comma-separated list of skill names, nothing else.`,
            ].join(" "),
          }],
        }),
      });
      if (res.ok) {
        const text = await res.text();
        const suggestions = text.split(",").map(s => s.trim()).filter(Boolean);
        const newSkills = suggestions.filter(
          s => !value.some(v => v.name.toLowerCase() === s.toLowerCase())
        ).slice(0, Math.min(8, maxSkills - value.length));
        onChange([...value, ...newSkills.map(name => ({ name, level: "intermediate" as const }))]);
      }
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium text-foreground">{label}</label>}

      {/* Chips Container */}
      <div
        className="min-h-12 rounded-xl border border-border bg-background focus-within:border-primary flex flex-wrap gap-1.5 cursor-text chip-pad"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((skill, i) => (
          <span
            key={i}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors
              ${showLevels ? LEVEL_COLORS[skill.level ?? "intermediate"] : "bg-primary/10 text-primary"}`}
          >
            {showLevels ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); cycleLevel(i); }}
                title={t("changeSkillLevel")}
                className="text-start hover:opacity-70"
              >
                {skill.name}
                <span className="ms-1 opacity-60 capitalize">{skill.level?.[0]}</span>
              </button>
            ) : (
              skill.name
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeSkill(i); }}
              aria-label={t("removeSkill", { skill: skill.name })}
              className="ms-0.5 hover:opacity-70"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {/* Input */}
        {value.length < maxSkills && (
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => { if (input.trim()) addSkill(input); }}
            placeholder={value.length === 0 ? placeholder : ""}
            className="flex-1 min-w-28 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {t(showLevels ? "skillsCountWithHint" : "skillsCount", {
            count: value.length.toLocaleString(numberLocale),
            max: maxSkills.toLocaleString(numberLocale),
          })}
        </p>
        <div className="flex items-center gap-2">
          {input.trim() && (
            <button type="button" onClick={() => addSkill(input)}
              className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Plus className="h-3 w-3" /> {t("add")}
            </button>
          )}
          {enableAISuggest && (
            <button type="button" onClick={getAISuggestions} disabled={aiLoading}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors">
              {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {t("aiSuggest")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
