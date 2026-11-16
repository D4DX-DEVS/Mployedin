"use client";

import { useTranslations } from "next-intl";
import { ListChecks, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface QuickStartStepProps {
  text: string;
  onTextChange: (text: string) => void;
  filling: boolean;
  error: string;
  onFill: () => void;
  onStepByStep: () => void;
}

const MIN_CHARS = 20;

/**
 * The fast path: the seeker writes about themselves in their own words, AI
 * sorts it into every CV field, and the next steps become a review.
 */
export function QuickStartStep({ text, onTextChange, filling, error, onFill, onStepByStep }: QuickStartStepProps) {
  const t = useTranslations("cvWizard.quick");
  const ready = text.trim().length >= MIN_CHARS;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cvw-about" className="text-base">{t("label")}</Label>
        <Textarea
          id="cvw-about"
          rows={8}
          maxLength={6000}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={t("placeholder")}
          className="text-sm leading-relaxed"
          disabled={filling}
        />
        <p className="text-xs text-gray-500">{t("include")}</p>
      </div>

      {error && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>}

      <Button type="button" disabled={!ready || filling} onClick={onFill} className="min-h-12 w-full gap-2 text-base">
        {filling ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
        {filling ? t("filling") : t("fill")}
      </Button>
      {filling && <p className="text-center text-xs text-gray-500">{t("fillingHint")}</p>}

      <div className="flex items-center gap-3 text-xs text-gray-400" aria-hidden="true">
        <span className="h-px flex-1 bg-gray-200" />{t("or")}<span className="h-px flex-1 bg-gray-200" />
      </div>
      <Button type="button" variant="outline" disabled={filling} onClick={onStepByStep} className="min-h-11 w-full gap-2">
        <ListChecks className="h-4 w-4" /> {t("stepByStep")}
      </Button>
    </div>
  );
}
