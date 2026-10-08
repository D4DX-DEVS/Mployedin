"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  A11Y_OPEN_EVENT,
  type A11yPreferences,
  BOOLEAN_PREFERENCES,
  DEFAULT_A11Y,
  TEXT_SIZES,
  type TextSize,
  applyPreferences,
  loadPreferences,
  savePreferences,
} from "@/lib/a11y/preferences";
import { ReadingGuide } from "./ReadingGuide";

/**
 * Accessibility settings dialog, mounted once per page by the [locale] layout
 * and opened from the header / footer "Accessibility" controls. Changes apply
 * instantly (so the user sees the effect) and persist on this device.
 */
export function AccessibilitySettings({ locale }: { locale: string }) {
  const t = useTranslations("accessibility");
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<A11yPreferences>(DEFAULT_A11Y);

  useEffect(() => {
    const saved = loadPreferences();
    setPrefs(saved);
    applyPreferences(saved);
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(A11Y_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(A11Y_OPEN_EVENT, onOpen);
  }, []);

  const update = useCallback((next: A11yPreferences) => {
    setPrefs(next);
    savePreferences(next);
  }, []);

  return (
    <>
      {prefs.readingGuide && <ReadingGuide />}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("panelTitle")}</DialogTitle>
            <DialogDescription>{t("panelDescription")}</DialogDescription>
          </DialogHeader>

          <fieldset className="rounded-xl border border-border p-3 sm:p-4">
            <legend className="px-1 text-sm font-semibold text-foreground">{t("textSize")}</legend>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {TEXT_SIZES.map((size) => {
                const checked = prefs.textSize === size;
                return (
                  <label
                    key={size}
                    className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[hsl(var(--focus-ring))] ${
                      checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="a11y-text-size"
                      value={size}
                      checked={checked}
                      onChange={() => update({ ...prefs, textSize: size as TextSize })}
                      className="sr-only"
                    />
                    {size}%
                  </label>
                );
              })}
            </div>
          </fieldset>

          <ul className="divide-y divide-border rounded-xl border border-border">
            {BOOLEAN_PREFERENCES.map((key) => {
              const id = `a11y-${key}`;
              return (
                <li key={key} className="flex items-start justify-between gap-4 p-3 sm:px-4">
                  <div className="min-w-0">
                    <label htmlFor={id} className="text-sm font-semibold text-foreground">
                      {t(`options.${key}.title`)}
                    </label>
                    <p id={`${id}-desc`} className="text-sm text-muted-foreground">
                      {t(`options.${key}.description`)}
                    </p>
                  </div>
                  <Switch
                    id={id}
                    className="mt-0.5"
                    checked={prefs[key]}
                    aria-describedby={`${id}-desc`}
                    onCheckedChange={(value) => update({ ...prefs, [key]: value })}
                  />
                </li>
              );
            })}
          </ul>

          <p className="text-xs text-muted-foreground">
            {t("osHint")}{" "}
            <Link href={`/${locale}/accessibility`} className="underline underline-offset-2" onClick={() => setOpen(false)}>
              {t("statementLink")}
            </Link>
          </p>

          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" className="min-h-11" onClick={() => update({ ...DEFAULT_A11Y })}>
              <RotateCcw aria-hidden />
              {t("reset")}
            </Button>
            <Button className="min-h-11" onClick={() => setOpen(false)}>
              {t("done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
