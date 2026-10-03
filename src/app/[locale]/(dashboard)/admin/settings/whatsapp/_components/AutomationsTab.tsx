"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Save, Zap } from "lucide-react";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API, AUTOMATION_ORDER, SectionCard, automationLabel, fetchJson, fitParams, hasBlankParam, paramProblem, paramRule, type WaAutomation, type WaConfig, type WaTemplate } from "./shared";

type AutomationKey = (typeof AUTOMATION_ORDER)[number];
const EMPTY: WaAutomation = { enabled: false, templateName: "", params: [] };

const sameAutomation = (a: WaAutomation, b: WaAutomation | undefined): boolean =>
  !!b && a.enabled === b.enabled && a.templateName === b.templateName && a.params.length === b.params.length && a.params.every((p, i) => p === b.params[i]);

/** The config as the page holds it: a missing automations map is an empty one. */
const loaded = (c: WaConfig): WaConfig => ({ ...c, automations: c.automations ?? {} });

interface AutomationRowProps {
  id: AutomationKey;
  automation: WaAutomation;
  /** Approved templates; null until they have loaded, or when they could not be. */
  approved: WaTemplate[] | null;
  onToggle: (enabled: boolean) => void;
  onPick: (name: string) => void;
  onParam: (index: number, value: string) => void;
  onMatch: (count: number) => void;
}

function AutomationRow({ id, automation: a, approved, onToggle, onPick, onParam, onMatch }: AutomationRowProps) {
  const t = useTranslations("adminWhatsApp");
  const label = automationLabel(id, t);
  const names = Array.from(new Set((approved ?? []).map((x) => x.name))).sort();
  const rule = paramRule(approved, a.templateName);
  const problem = paramProblem(rule, a.params);
  const blank = hasBlankParam(a.params);
  return (
    <div
      role="group"
      aria-labelledby={`wa-auto-label-${id}`}
      className="grid gap-3 border-t border-border/40 py-4 first:border-t-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,2fr)] lg:items-start"
    >
      <div className="flex items-center gap-3">
        <Switch id={`wa-auto-${id}`} checked={a.enabled} onCheckedChange={onToggle} />
        <Label id={`wa-auto-label-${id}`} htmlFor={`wa-auto-${id}`} className="font-medium">{label}</Label>
      </div>
      <div className="min-w-0 space-y-1">
        <Label htmlFor={`wa-auto-tpl-${id}`} className="text-xs text-muted-foreground">{t("templateColumn")}</Label>
        <Select value={a.templateName || undefined} onValueChange={onPick}>
          <SelectTrigger id={`wa-auto-tpl-${id}`} aria-label={`${label} · ${t("templateColumn")}`}>
            <SelectValue placeholder={t("templateColumn")} />
          </SelectTrigger>
          <SelectContent>
            {/* Radix forbids an empty-string item value; the current name stays pickable even before Meta approves it. */}
            {a.templateName && !names.includes(a.templateName) && <SelectItem value={a.templateName}>{a.templateName}</SelectItem>}
            {names.map((n) => (
              <SelectItem key={n} value={n}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Only once the approved list has loaded: an empty list from a failed load says nothing about approval. */}
        {approved && a.templateName && !names.includes(a.templateName) && <p className="text-xs text-amber-600">{t("notApproved")}</p>}
      </div>
      <div className="min-w-0 space-y-1">
        <span className="text-xs text-muted-foreground">{t("paramsColumn")}</span>
        {a.params.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noParams")}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {a.params.map((v, i) => (
              <Input
                key={i}
                dir="ltr"
                maxLength={1024}
                aria-label={`${label} · ${t("paramPlaceholder", { index: i + 1 })}`}
                aria-invalid={problem || v.trim() === "" ? true : undefined}
                value={v}
                onChange={(e) => onParam(i, e.target.value)}
              />
            ))}
          </div>
        )}
        {problem?.kind === "mismatch" && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-destructive">{t("paramCountMismatch", { expected: problem.expected, actual: a.params.length })}</p>
            <Button type="button" size="dense" variant="outline" onClick={() => onMatch(problem.expected)}>{t("paramsMatchTemplate")}</Button>
          </div>
        )}
        {problem?.kind === "conflict" && <p className="text-xs text-destructive">{t("paramLanguageConflict")}</p>}
        {blank && <p className="text-xs text-destructive">{t("paramEmpty")}</p>}
      </div>
    </div>
  );
}

export function AutomationsTab() {
  const t = useTranslations("adminWhatsApp");
  const tc = useTranslations("common");
  const [config, setConfig] = useState<WaConfig | null>(null);
  // What the server last gave: Save sends only what differs from it, so a stale tab cannot overwrite settings it never touched.
  const [saved, setSaved] = useState<WaConfig | null>(null);
  // The cap is held as typed: parsing on every keystroke turned an emptied field back into "1" and the next digit into "15".
  const [capText, setCapText] = useState("");
  const [approved, setApproved] = useState<WaTemplate[] | null>(null);
  const [templatesFailed, setTemplatesFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    const data = await fetchJson<{ config?: WaConfig }>(API.config);
    if (data?.config) {
      setConfig(loaded(data.config));
      setSaved(loaded(data.config));
      setCapText(String(data.config.dailyCapPerUser ?? ""));
    } else {
      setConfig(null);
      toast.error(t("loadError"));
    }
    setLoading(false);
  }, [t]);

  const loadTemplates = useCallback(async () => {
    setTemplatesFailed(false);
    const data = await fetchJson<{ templates?: WaTemplate[] }>(`${API.templates}?status=APPROVED`);
    setApproved(Array.isArray(data?.templates) ? data.templates : null);
    setTemplatesFailed(!Array.isArray(data?.templates));
  }, []);

  useEffect(() => {
    loadConfig();
    loadTemplates();
  }, [loadConfig, loadTemplates]);

  const automationOf = (key: AutomationKey): WaAutomation => config?.automations[key] ?? EMPTY;

  const updateAutomation = (key: AutomationKey, change: (a: WaAutomation) => Partial<WaAutomation>) =>
    setConfig((c) => {
      if (!c) return c;
      const a = c.automations[key] ?? EMPTY;
      return { ...c, automations: { ...c.automations, [key]: { ...a, ...change(a) } } };
    });

  const pickTemplate = (key: AutomationKey, name: string) => {
    const rule = paramRule(approved, name);
    updateAutomation(key, (a) => ({ templateName: name, params: rule.kind === "exact" ? fitParams(a.params, rule.count) : a.params }));
  };

  const capNumber = /^\d{1,2}$/.test(capText.trim()) ? Number(capText) : NaN;
  const capValid = capNumber >= 1 && capNumber <= 20;
  // A disabled automation never sends, so its parameter problem is shown but does not hold back the other settings.
  // An empty parameter counts: Meta rejects it, so the automation would fail every send.
  const blocked = AUTOMATION_ORDER.some((key) => {
    const a = automationOf(key);
    return a.enabled && (paramProblem(paramRule(approved, a.templateName), a.params) !== null || hasBlankParam(a.params));
  });

  // Only what changed since the last load or save; a changed automation still goes as its whole object.
  const changes: { enabled?: boolean; dailyCapPerUser?: number; automations?: Record<string, WaAutomation> } = {};
  if (config && saved) {
    if (config.enabled !== saved.enabled) changes.enabled = config.enabled;
    if (capValid && capNumber !== saved.dailyCapPerUser) changes.dailyCapPerUser = capNumber;
    const automations: Record<string, WaAutomation> = {};
    for (const key of AUTOMATION_ORDER) {
      const a = automationOf(key);
      if (a.templateName && !sameAutomation(a, saved.automations[key])) automations[key] = { enabled: a.enabled, templateName: a.templateName, params: a.params };
    }
    if (Object.keys(automations).length > 0) changes.automations = automations;
  }
  const dirty = Object.keys(changes).length > 0;
  // The master switch is the kill switch: turning it off is never held back by an automation's parameter
  // problem (that very save stops the automation sending). Only that change alone is exempt.
  const onlyMasterOff = changes.enabled === false && Object.keys(changes).length === 1;
  const saveBlocked = blocked && !onlyMasterOff;

  const save = async () => {
    if (!config || !capValid || saveBlocked || !dirty) return;
    setSaving(true);
    try {
      const res = await fetch(API.config, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (!res.ok) {
        toast.error(res.status === 400 ? t("saveInvalid") : t("saveError"));
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { config?: WaConfig };
      if (data.config) {
        setConfig(loaded(data.config));
        setCapText(String(data.config.dailyCapPerUser ?? capNumber));
      }
      // The baseline for the next save: what the server now holds, or failing that what was just sent.
      setSaved(data.config ? loaded(data.config) : { ...config, dailyCapPerUser: capNumber });
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SectionCard title={t("automationsTitle")} icon={Zap}>
        <div className="panel-body space-y-3" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          {AUTOMATION_ORDER.map((key) => (
            <Skeleton key={key} className="h-14 w-full" />
          ))}
        </div>
      </SectionCard>
    );
  }

  if (!config) {
    return <ErrorState onRetry={() => { loadConfig(); loadTemplates(); }} />;
  }

  return (
    <SectionCard
      title={t("automationsTitle")}
      icon={Zap}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {saveBlocked && <p id="wa-save-blocked" className="max-w-xs text-end text-xs text-destructive">{t("saveBlocked")}</p>}
          <Button type="button" size="dense" onClick={save} disabled={saving || !capValid || saveBlocked || !dirty} aria-describedby={saveBlocked ? "wa-save-blocked" : undefined}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} {saving ? t("saving") : t("save")}
          </Button>
        </div>
      }
    >
      <div className="panel-body space-y-4">
        <p className="text-sm text-muted-foreground">{t("automationsDesc")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3">
            <div className="space-y-1">
              <Label htmlFor="wa-master" className="font-medium">{t("masterSwitch")}</Label>
              <p id="wa-master-help" className="text-xs text-muted-foreground">{t("masterSwitchHelp")}</p>
            </div>
            <Switch
              id="wa-master"
              aria-describedby="wa-master-help"
              checked={config.enabled}
              onCheckedChange={(v) => setConfig((c) => (c ? { ...c, enabled: v } : c))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wa-daily-cap">{t("dailyCap")}</Label>
            <Input
              id="wa-daily-cap"
              type="number"
              min={1}
              max={20}
              value={capText}
              aria-invalid={!capValid}
              aria-describedby="wa-daily-cap-help"
              onChange={(e) => setCapText(e.target.value)}
            />
            <p id="wa-daily-cap-help" className={`text-xs ${capValid ? "text-muted-foreground" : "text-destructive"}`}>{t("dailyCapHelp")}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("tokensHelp")}</p>
        {templatesFailed && (
          <div className="flex flex-wrap items-center gap-2" role="status">
            <p className="text-xs text-amber-600">{t("templatesLoadError")}</p>
            <Button type="button" size="dense" variant="outline" onClick={loadTemplates}>{tc("errorStateRetry")}</Button>
          </div>
        )}

        <div>
          {AUTOMATION_ORDER.map((key) => (
            <AutomationRow
              key={key}
              id={key}
              automation={automationOf(key)}
              approved={approved}
              onToggle={(enabled) => updateAutomation(key, () => ({ enabled }))}
              onPick={(name) => pickTemplate(key, name)}
              onParam={(index, value) => updateAutomation(key, (a) => ({ params: a.params.map((x, j) => (j === index ? value : x)) }))}
              onMatch={(count) => updateAutomation(key, (a) => ({ params: fitParams(a.params, count) }))}
            />
          ))}
        </div>
      </div>
    </SectionCard>
  );
}
