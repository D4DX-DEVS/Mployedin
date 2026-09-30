"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowDownToLine,
  AudioLines,
  CircleCheck,
  CirclePause,
  Contrast,
  Focus,
  Keyboard,
  Link as LinkIcon,
  MessageSquareWarning,
  Move,
  RotateCcw,
  Save,
  TextAlignJustify,
  Type,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import { isDefaultPreferences } from "@/lib/a11y/preferences";
import { useA11yPreferences } from "@/lib/a11y/usePreferences";
import { PreferenceSwitch } from "./PreferenceSwitch";
import { TextSizeControl } from "./TextSizeControl";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>;
}

/** A titled line of explanation: the Content and Help tabs are made of these. */
function InfoItem({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <div className="text-xs leading-5 text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

export function DisplaySection() {
  const t = useTranslations("a11y");
  const { prefs, update, reset } = useA11yPreferences();

  return (
    <div className="space-y-4">
      <TextSizeControl value={prefs.textScale} onChange={(textScale) => update({ textScale })} />
      <div className="divide-y divide-border/60 border-y border-border/60">
        <PreferenceSwitch
          icon={Contrast}
          label={t("highContrast")}
          hint={t("highContrastHint")}
          checked={prefs.highContrast}
          onCheckedChange={(highContrast) => update({ highContrast })}
        />
        <PreferenceSwitch
          icon={CirclePause}
          label={t("reduceMotion")}
          hint={t("reduceMotionHint")}
          checked={prefs.reduceMotion}
          onCheckedChange={(reduceMotion) => update({ reduceMotion })}
        />
      </div>
      <section>
        <SectionHeading>{t("readingSupport")}</SectionHeading>
        <div className="divide-y divide-border/60">
          <PreferenceSwitch
            icon={Type}
            label={t("readableFont")}
            hint={t("readableFontHint")}
            checked={prefs.readableFont}
            onCheckedChange={(readableFont) => update({ readableFont })}
          />
          <PreferenceSwitch
            icon={TextAlignJustify}
            label={t("wideSpacing")}
            hint={t("wideSpacingHint")}
            checked={prefs.wideSpacing}
            onCheckedChange={(wideSpacing) => update({ wideSpacing })}
          />
          <PreferenceSwitch
            icon={LinkIcon}
            label={t("highlightLinks")}
            hint={t("highlightLinksHint")}
            checked={prefs.highlightLinks}
            onCheckedChange={(highlightLinks) => update({ highlightLinks })}
          />
        </div>
      </section>
      {/* Stays in place once used: removing it would drop focus onto <body>. */}
      <button
        type="button"
        // Nothing changed: no reset, and no cookie for a visitor who never customised.
        onClick={() => {
          if (!isDefaultPreferences(prefs)) reset();
        }}
        aria-disabled={isDefaultPreferences(prefs) || undefined}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
      >
        <RotateCcw aria-hidden="true" className="size-4" />
        {t("resetAll")}
      </button>
    </div>
  );
}

interface NavigationSectionProps {
  onSkipToMain: () => void;
  /** Where the floating button is shown: puts a dragged button back. */
  onResetLauncher?: () => void;
  launcherMoved: boolean;
}

export function NavigationSection({ onSkipToMain, onResetLauncher, launcherMoved }: NavigationSectionProps) {
  const t = useTranslations("a11y");
  const { prefs, update } = useA11yPreferences();
  const keys = [
    { key: t("keyTab"), action: t("keyTabHint") },
    { key: t("keyShiftTab"), action: t("keyShiftTabHint") },
    { key: t("keyEnter"), action: t("keyEnterHint") },
    { key: t("keyEsc"), action: t("keyEscHint") },
    { key: t("keyArrows"), action: t("keyArrowsHint") },
  ];

  return (
    <div className="space-y-4">
      <div className="border-b border-border/60">
        <PreferenceSwitch
          icon={Focus}
          label={t("strongFocus")}
          hint={t("strongFocusHint")}
          checked={prefs.strongFocus}
          onCheckedChange={(strongFocus) => update({ strongFocus })}
        />
      </div>
      <button
        type="button"
        onClick={onSkipToMain}
        className="flex min-h-11 w-full items-start gap-3 rounded-xl border border-border p-3 text-start hover:bg-muted"
      >
        <ArrowDownToLine aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">{t("skipToContent")}</span>
          <span className="block text-xs leading-5 text-muted-foreground">{t("skipToMainHint")}</span>
        </span>
      </button>
      {onResetLauncher && (
        // The one-click alternative to dragging the button (WCAG 2.5.7).
        <div className="flex items-start gap-3 rounded-xl border border-border p-3">
          <Move aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{t("buttonPosition")}</p>
            <p className="text-xs leading-5 text-muted-foreground">{t("buttonPositionHint")}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (launcherMoved) onResetLauncher();
            }}
            aria-disabled={!launcherMoved || undefined}
            className="min-h-11 shrink-0 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
          >
            {t("resetPosition")}
          </button>
        </div>
      )}
      <section>
        <div className="flex items-center gap-2">
          <Keyboard aria-hidden="true" className="size-4 text-foreground/70" />
          <SectionHeading>{t("keyboardHeading")}</SectionHeading>
        </div>
        <dl className="mt-2 divide-y divide-border/60">
          {keys.map(({ key, action }) => (
            <div key={key} className="flex items-center justify-between gap-3 py-2">
              <dt className="shrink-0">
                <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 font-sans text-xs font-semibold text-foreground">
                  {key}
                </kbd>
              </dt>
              <dd className="text-end text-xs leading-5 text-muted-foreground">{action}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

export function ContentSection() {
  const t = useTranslations("a11y");
  return (
    <section>
      <SectionHeading>{t("contentHeading")}</SectionHeading>
      <ul className="mt-1 divide-y divide-border/60">
        <InfoItem icon={CircleCheck} title={t("contentScreenReader")}>{t("contentScreenReaderHint")}</InfoItem>
        <InfoItem icon={CircleCheck} title={t("contentForms")}>{t("contentFormsHint")}</InfoItem>
        <InfoItem icon={CircleCheck} title={t("contentImages")}>{t("contentImagesHint")}</InfoItem>
        <InfoItem icon={CircleCheck} title={t("contentKeyboard")}>{t("contentKeyboardHint")}</InfoItem>
      </ul>
    </section>
  );
}

export function HelpSection({ locale, onNavigate }: { locale: string; onNavigate: () => void }) {
  const t = useTranslations("a11y");
  return (
    <ul className="divide-y divide-border/60">
      <InfoItem icon={ZoomIn} title={t("helpZoom")}>{t("helpZoomHint")}</InfoItem>
      <InfoItem icon={AudioLines} title={t("helpScreenReader")}>{t("helpScreenReaderHint")}</InfoItem>
      <InfoItem icon={Save} title={t("helpSaved")}>{t("helpSavedHint")}</InfoItem>
      <InfoItem icon={MessageSquareWarning} title={t("helpContact")}>
        {t("helpContactHint")}{" "}
        <Link
          href={`/${locale}/contact`}
          onClick={onNavigate}
          className="font-semibold text-primary underline underline-offset-4"
        >
          {t("helpContactLink")}
        </Link>
      </InfoItem>
    </ul>
  );
}
