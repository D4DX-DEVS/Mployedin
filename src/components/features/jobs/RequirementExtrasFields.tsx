"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * The requirements a match is checked against beyond skills — what an HR
 * person sets when posting: the minimum education (or "No minimum"), what the
 * years of experience are in, licences / certificates and languages, each a
 * must-have or a nice-to-have, and the kind of hire. Shared by the post
 * wizard (Step3Requirements) and the edit page (SharedJobEditPage); both read
 * and write the same shape. The matcher reads it in lib/matching/jobRequirements.ts.
 */

export type Importance = "must" | "nice";
export type HireTypeValue = "experienced" | "skills" | "qualification" | "entry";

export interface RequirementExtras {
  /** 0 = no minimum, 1 school … 5 doctorate; null = not chosen yet. */
  educationLevel: number | null;
  educationField: string;
  educationFieldEssential: boolean;
  educationImportance: Importance;
  experienceIn: string;
  languages: string[];
  languagesImportance: Importance;
  credentials: Array<{ name: string; importance: Importance }>;
  hireType: HireTypeValue | null;
}

export const EMPTY_REQUIREMENT_EXTRAS: RequirementExtras = {
  educationLevel: null,
  educationField: "",
  educationFieldEssential: false,
  educationImportance: "must",
  experienceIn: "",
  languages: [],
  languagesImportance: "nice",
  credentials: [],
  hireType: null,
};

const LEVELS = [0, 1, 2, 3, 4, 5] as const;
const HIRE_TYPES: readonly HireTypeValue[] = ["experienced", "skills", "qualification", "entry"];
const NO_HIRE_TYPE = "none";

interface Props {
  value: RequirementExtras;
  onChange: (next: RequirementExtras) => void;
  /** Shown under the education picker (it is required on publish, D10). */
  educationError?: string | null;
  className?: string;
}

/** Must-have / Nice-to-have, as two pressed-state buttons. */
function ImportanceToggle({
  value,
  onChange,
  label,
}: {
  value: Importance;
  onChange: (next: Importance) => void;
  label: string;
}) {
  const t = useTranslations("jobRequirementExtras");
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-border p-0.5">
      {(["must", "nice"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "min-h-9 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(`importance.${option}`)}
        </button>
      ))}
    </div>
  );
}

export function RequirementExtrasFields({ value, onChange, educationError, className }: Props) {
  const t = useTranslations("jobRequirementExtras");
  const ids = useId();
  const [languageInput, setLanguageInput] = useState("");
  const [credentialInput, setCredentialInput] = useState("");
  const set = <K extends keyof RequirementExtras>(key: K, next: RequirementExtras[K]) => onChange({ ...value, [key]: next });

  function addLanguage() {
    const name = languageInput.trim();
    setLanguageInput("");
    if (!name || value.languages.some((l) => l.toLowerCase() === name.toLowerCase()) || value.languages.length >= 20) return;
    set("languages", [...value.languages, name]);
  }

  function addCredential() {
    const name = credentialInput.trim();
    setCredentialInput("");
    if (!name || value.credentials.some((c) => c.name.toLowerCase() === name.toLowerCase()) || value.credentials.length >= 10) return;
    set("credentials", [...value.credentials, { name, importance: "must" }]);
  }

  const levelSet = value.educationLevel !== null && value.educationLevel > 0;

  return (
    <div className={cn("space-y-6", className)}>
      {/* Kind of hire — sets how candidates are ranked by default. */}
      <div className="space-y-2">
        <Label htmlFor={`${ids}-hire`} className="text-sm font-semibold">
          {t("hireType.label")} <span className="text-xs font-normal text-muted-foreground">({t("optional")})</span>
        </Label>
        <p className="text-xs text-muted-foreground">{t("hireType.hint")}</p>
        <Select
          value={value.hireType ?? NO_HIRE_TYPE}
          onValueChange={(v) => set("hireType", v === NO_HIRE_TYPE ? null : (v as HireTypeValue))}
        >
          <SelectTrigger id={`${ids}-hire`} className="min-h-11 sm:min-h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_HIRE_TYPE}>{t("hireType.none")}</SelectItem>
            {HIRE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`hireType.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Education — required: a level, or "No minimum". */}
      <div className="space-y-3">
        <div>
          <Label htmlFor={`${ids}-level`} className="text-sm font-semibold">
            {t("education.label")}
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">{t("education.hint")}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select
            value={value.educationLevel === null ? undefined : String(value.educationLevel)}
            onValueChange={(v) => set("educationLevel", Number(v))}
          >
            <SelectTrigger
              id={`${ids}-level`}
              className={cn("min-h-11 sm:min-h-10 sm:w-64", educationError && "border-destructive")}
              aria-invalid={Boolean(educationError)}
              aria-describedby={educationError ? `${ids}-level-error` : undefined}
            >
              <SelectValue placeholder={t("education.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((level) => (
                <SelectItem key={level} value={String(level)}>
                  {t(`education.levels.${level}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {levelSet && (
            <ImportanceToggle
              value={value.educationImportance}
              onChange={(v) => set("educationImportance", v)}
              label={t("education.importanceLabel")}
            />
          )}
        </div>
        {educationError && (
          <p id={`${ids}-level-error`} role="alert" className="text-xs font-medium text-destructive">
            {educationError}
          </p>
        )}
        {levelSet && (
          <div className="space-y-3">
            <div className="field">
              <Label htmlFor={`${ids}-field`} className="text-xs text-muted-foreground">
                {t("education.fieldLabel")} <span className="font-normal">({t("optional")})</span>
              </Label>
              <Input
                id={`${ids}-field`}
                maxLength={200}
                value={value.educationField}
                placeholder={t("education.fieldPlaceholder")}
                onChange={(e) => set("educationField", e.target.value)}
              />
            </div>
            {value.educationField.trim() && (
              <div className="flex items-start gap-3">
                <Switch
                  id={`${ids}-essential`}
                  checked={value.educationFieldEssential}
                  onCheckedChange={(checked) => set("educationFieldEssential", checked)}
                  className="mt-0.5"
                />
                <Label htmlFor={`${ids}-essential`} className="text-xs font-normal leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">{t("education.essentialLabel")}</span>
                  <br />
                  {t("education.essentialHint")}
                </Label>
              </div>
            )}
          </div>
        )}
      </div>

      {/* What the years of experience are in. */}
      <div className="space-y-2">
        <Label htmlFor={`${ids}-exp-in`} className="text-sm font-semibold">
          {t("experienceIn.label")} <span className="text-xs font-normal text-muted-foreground">({t("optional")})</span>
        </Label>
        <p className="text-xs text-muted-foreground">{t("experienceIn.hint")}</p>
        <Input
          id={`${ids}-exp-in`}
          maxLength={200}
          value={value.experienceIn}
          placeholder={t("experienceIn.placeholder")}
          onChange={(e) => set("experienceIn", e.target.value)}
        />
      </div>

      {/* Licences and certificates. */}
      <div className="space-y-2">
        <Label htmlFor={`${ids}-cred`} className="text-sm font-semibold">
          {t("credentials.label")} <span className="text-xs font-normal text-muted-foreground">({t("optional")})</span>
        </Label>
        <p className="text-xs text-muted-foreground">{t("credentials.hint")}</p>
        <div className="flex gap-2">
          <Input
            id={`${ids}-cred`}
            maxLength={200}
            value={credentialInput}
            placeholder={t("credentials.placeholder")}
            onChange={(e) => setCredentialInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCredential();
              }
            }}
          />
          <Button type="button" variant="outline" className="min-h-11 shrink-0 gap-1.5 sm:min-h-10" onClick={addCredential}>
            <Plus className="size-4" aria-hidden="true" />
            {t("add")}
          </Button>
        </div>
        {value.credentials.length > 0 && (
          <ul className="space-y-2">
            {value.credentials.map((credential, i) => (
              <li key={credential.name} className="flex flex-col gap-2 rounded-lg border border-border/70 px-3 py-2 sm:flex-row sm:items-center">
                <span className="min-w-0 flex-1 break-words text-sm text-foreground">{credential.name}</span>
                <div className="flex items-center gap-2">
                  <ImportanceToggle
                    value={credential.importance}
                    onChange={(importance) =>
                      set(
                        "credentials",
                        value.credentials.map((c, j) => (j === i ? { ...c, importance } : c)),
                      )
                    }
                    label={t("credentials.importanceLabel", { name: credential.name })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0"
                    aria-label={t("remove", { name: credential.name })}
                    onClick={() => set("credentials", value.credentials.filter((_, j) => j !== i))}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Languages. */}
      <div className="space-y-2">
        <Label htmlFor={`${ids}-lang`} className="text-sm font-semibold">
          {t("languages.label")} <span className="text-xs font-normal text-muted-foreground">({t("optional")})</span>
        </Label>
        <p className="text-xs text-muted-foreground">{t("languages.hint")}</p>
        <div className="flex gap-2">
          <Input
            id={`${ids}-lang`}
            maxLength={100}
            value={languageInput}
            placeholder={t("languages.placeholder")}
            onChange={(e) => setLanguageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addLanguage();
              }
            }}
          />
          <Button type="button" variant="outline" className="min-h-11 shrink-0 gap-1.5 sm:min-h-10" onClick={addLanguage}>
            <Plus className="size-4" aria-hidden="true" />
            {t("add")}
          </Button>
        </div>
        {value.languages.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {value.languages.map((language) => (
              <span key={language} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 py-1 ps-3 pe-1 text-xs">
                {language}
                <button
                  type="button"
                  className="rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t("remove", { name: language })}
                  onClick={() => set("languages", value.languages.filter((l) => l !== language))}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            ))}
            <ImportanceToggle
              value={value.languagesImportance}
              onChange={(v) => set("languagesImportance", v)}
              label={t("languages.importanceLabel")}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The job's stored requirements → the form's value. `languages` stored on the
 * job but never confirmed on the form still pre-fill, so saving the form is
 * the confirmation (D14).
 */
export function requirementExtrasFromJob(job: {
  hireType?: string | null;
  requirements?: {
    educationLevel?: number | null;
    educationField?: string;
    educationFieldEssential?: boolean;
    educationImportance?: string;
    experienceIn?: string;
    languages?: string[];
    languagesImportance?: string;
    credentials?: Array<{ name?: string; importance?: string }>;
  } | null;
}): RequirementExtras {
  const r = job.requirements ?? {};
  const importance = (v: string | undefined, fallback: Importance): Importance => (v === "must" || v === "nice" ? v : fallback);
  return {
    educationLevel: typeof r.educationLevel === "number" ? r.educationLevel : null,
    educationField: r.educationField ?? "",
    educationFieldEssential: Boolean(r.educationFieldEssential),
    educationImportance: importance(r.educationImportance, "must"),
    experienceIn: r.experienceIn ?? "",
    languages: (r.languages ?? []).filter(Boolean),
    languagesImportance: importance(r.languagesImportance, "nice"),
    credentials: (r.credentials ?? [])
      .filter((c) => c.name?.trim())
      .map((c) => ({ name: c.name as string, importance: importance(c.importance, "must") })),
    hireType: HIRE_TYPES.find((type) => type === job.hireType) ?? null,
  };
}

/**
 * The form's value → the API's `requirements` keys and `hireType`. The
 * server stamps the languages as confirmed when a save sends them
 * (lib/jobs/requirementLanguages.ts); no timestamp here, so the edit page's
 * changed-fields diff stays stable.
 */
export function requirementExtrasPayload(value: RequirementExtras): {
  requirements: Record<string, unknown>;
  hireType: HireTypeValue | null;
} {
  const field = value.educationField.trim();
  return {
    requirements: {
      ...(value.educationLevel !== null ? { educationLevel: value.educationLevel } : {}),
      educationField: field,
      educationFieldEssential: Boolean(field) && value.educationFieldEssential,
      educationImportance: value.educationImportance,
      experienceIn: value.experienceIn.trim(),
      languages: value.languages,
      languagesImportance: value.languagesImportance,
      credentials: value.credentials,
    },
    hireType: value.hireType,
  };
}
