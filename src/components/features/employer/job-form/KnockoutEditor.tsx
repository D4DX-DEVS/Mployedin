"use client";

/**
 * The answer rule under one screening question — shared by the create wizard
 * and the edit page so both write the same shape (lib/matching/knockouts.ts).
 *
 * Two rules, one at a time: a deal-breaker (a non-qualifying answer fails the
 * requirements and leaves the candidate out of Shortlist Top) or a preferred
 * answer (a matching answer adds to the score; nobody is left out). Choice
 * questions pick the answers; number questions set the lowest one.
 */

import { useTranslations } from "next-intl";
import { ShieldCheck, Star } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { KNOCKOUT_NUMBER_TYPES, KNOCKOUT_OPTION_TYPES, knockoutRuleOf } from "@/lib/matching/knockouts";

export interface KnockoutPatch {
  knockout?: boolean;
  preferred?: boolean;
  acceptedAnswers?: string[];
  minValue?: number;
  required?: boolean;
}

interface KnockoutEditorProps {
  idPrefix: string;
  type: string;
  options: string[];
  knockout?: boolean;
  preferred?: boolean;
  acceptedAnswers?: string[];
  minValue?: number;
  onChange: (patch: KnockoutPatch) => void;
}

/** True when a question has an answer rule switched on but nothing to match. */
export function hasKnockoutProblem(question: {
  id: string;
  label: string;
  type: string;
  options?: string[];
  knockout?: boolean;
  preferred?: boolean;
  acceptedAnswers?: string[];
  minValue?: number;
}): boolean {
  return Boolean(question.knockout || question.preferred) && knockoutRuleOf(question) === null;
}

export function KnockoutEditor({
  idPrefix,
  type,
  options,
  knockout = false,
  preferred = false,
  acceptedAnswers = [],
  minValue,
  onChange,
}: KnockoutEditorProps) {
  const t = useTranslations("employerAts.knockout");
  const isOption = (KNOCKOUT_OPTION_TYPES as readonly string[]).includes(type);
  const isNumber = (KNOCKOUT_NUMBER_TYPES as readonly string[]).includes(type);
  const supported = isOption || isNumber;
  // A deal-breaker wins if both were ever set, as the API reads it.
  const mode: "knockout" | "preferred" | null = knockout ? "knockout" : preferred ? "preferred" : null;
  const choices = options.map((option) => option.trim()).filter(Boolean);
  const accepted = new Set(acceptedAnswers.map((a) => a.trim().toLowerCase()));
  const problem =
    mode !== null &&
    knockoutRuleOf({ id: idPrefix, label: "", type, options, knockout, preferred, acceptedAnswers, minValue }) === null;
  const errorId = `${idPrefix}-knockout-error`;

  const rules = [
    {
      key: "knockout" as const,
      id: `${idPrefix}-knockout`,
      icon: ShieldCheck,
      label: t("toggle"),
      hint: t("hint"),
      // A deal-breaker a candidate may skip would only ever read "not stated".
      turnOn: { knockout: true, preferred: false, required: true },
      turnOff: { knockout: false },
    },
    {
      key: "preferred" as const,
      id: `${idPrefix}-preferred`,
      icon: Star,
      label: t("preferredToggle"),
      hint: t("preferredHint"),
      turnOn: { preferred: true, knockout: false },
      turnOff: { preferred: false },
    },
  ];

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border/70 bg-muted/10 chip-pad">
      {supported ? (
        rules.map(({ key, id, icon: Icon, label, hint, turnOn, turnOff }) => (
          <div key={key} className="flex items-start gap-3">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <Label htmlFor={id} className="text-sm font-medium">
                {label}
              </Label>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
            <Switch
              id={id}
              checked={mode === key}
              aria-describedby={problem && mode === key ? errorId : undefined}
              onCheckedChange={(on) => onChange(on ? turnOn : turnOff)}
            />
          </div>
        ))
      ) : (
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">{t("unsupported")}</p>
        </div>
      )}

      {mode !== null && isOption ? (
        choices.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("needsOptions")}</p>
        ) : (
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-muted-foreground">
              {mode === "preferred" ? t("preferredAnswers") : t("acceptedAnswers")}
            </legend>
            {choices.map((choice, index) => {
              const id = `${idPrefix}-accept-${index}`;
              const checked = accepted.has(choice.toLowerCase());
              return (
                <div key={`${choice}-${index}`} className="flex min-h-11 items-center gap-2 sm:min-h-0">
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={(value) => {
                      const next = value === true
                        ? [...acceptedAnswers, choice]
                        : acceptedAnswers.filter((a) => a.trim().toLowerCase() !== choice.toLowerCase());
                      onChange({ acceptedAnswers: next });
                    }}
                  />
                  <Label htmlFor={id} className="text-sm font-normal">
                    {choice}
                  </Label>
                </div>
              );
            })}
          </fieldset>
        )
      ) : null}

      {mode !== null && isNumber ? (
        <div className="field">
          <Label htmlFor={`${idPrefix}-min`} className="text-xs font-medium text-muted-foreground">
            {mode === "preferred" ? t("preferredMin") : t("minValue")}
          </Label>
          <Input
            id={`${idPrefix}-min`}
            type="number"
            inputMode="decimal"
            value={minValue ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              onChange({ minValue: raw === "" ? undefined : Number(raw) });
            }}
            className="w-32 rounded-xl"
          />
        </div>
      ) : null}

      {problem && (isNumber || choices.length > 0) ? (
        <p id={errorId} className="text-xs text-destructive">
          {isNumber
            ? mode === "preferred" ? t("needsMinPreferred") : t("needsMin")
            : mode === "preferred" ? t("pickOnePreferred") : t("pickOne")}
        </p>
      ) : null}
    </div>
  );
}
