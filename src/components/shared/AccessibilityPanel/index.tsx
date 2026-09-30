"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import {
  ArrowUpRight,
  CircleQuestionMark,
  FileText,
  Keyboard,
  Monitor,
  PersonStanding,
  ScrollText,
  X,
} from "lucide-react";
import { RememberOpener } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { MAIN_CONTENT_ID } from "@/components/shared/SkipToContent";
import { syncPreferencesToDocument, useAccessibilityPanelOpen } from "@/lib/a11y/usePreferences";
import { ContentSection, DisplaySection, HelpSection, NavigationSection } from "./PanelSections";
import { Launcher } from "./Launcher";
import { saveLauncherPosition, useLauncherPosition } from "./useLauncherPosition";

interface AccessibilityPanelProps {
  locale: string;
  /** The statement link shows only once an admin has published it. */
  statementPublished: boolean;
  /** The floating button: bottom corner on phones, where it covers no form
      field; mid-height from `sm`; wherever the visitor drags it after that.
      Dashboards use the account menu instead. */
  showLauncher?: boolean;
}

/**
 * Display and navigation preferences a visitor can set in a couple of clicks,
 * with the formal Accessibility Statement one link away.
 *
 * Non-modal on purpose: the page stays visible and scrollable, so a change
 * (larger text, high contrast) shows the moment it is made. Rendered in place,
 * not portalled, so it sits right after its button in the tab order.
 */
export function AccessibilityPanel({ locale, statementPublished, showLauncher = true }: AccessibilityPanelProps) {
  const t = useTranslations("a11y");
  // From the locale prop, which matches the page's; the shared ui wrappers
  // read it from next-intl (see useLocaleDirection) since Radix assumes LTR.
  const dir = locale === "ar" ? "rtl" : "ltr";
  const [open, setOpen] = useAccessibilityPanelOpen();
  const launcherRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const leftByOutsideRef = useRef(false);
  const focusAfterCloseRef = useRef<HTMLElement | null>(null);
  const launcherPosition = useLauncherPosition();

  // The server already rendered the saved choices onto <html> from the cookie;
  // this re-applies them after a client-side change of layout.
  useEffect(() => {
    syncPreferencesToDocument();
    // Open state is shared; leaving a layout (public → dashboard) must not
    // carry an open panel into the next one.
    return () => setOpen(false);
  }, [setOpen]);

  const close = () => setOpen(false);

  const skipToMain = () => {
    const main = document.getElementById(MAIN_CONTENT_ID);
    if (main && !main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    focusAfterCloseRef.current = main;
    close();
  };

  const tabs = [
    { value: "display", icon: Monitor, label: t("tabDisplay") },
    { value: "navigation", icon: Keyboard, label: t("tabNavigation") },
    { value: "content", icon: FileText, label: t("tabContent") },
    { value: "help", icon: CircleQuestionMark, label: t("tabHelp") },
  ];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen} modal={false}>
      {showLauncher && (
        <Launcher
          ref={launcherRef}
          label={t("openPanel")}
          hint={t("launcherHint")}
          position={launcherPosition}
          onMove={saveLauncherPosition}
        />
      )}
      <DialogPrimitive.Content
        onOpenAutoFocus={() => {
          leftByOutsideRef.current = false;
        }}
        onInteractOutside={(event) => {
          // The launcher toggles the panel itself and is not "elsewhere";
          // flagging it left focus on <body> after a later Escape.
          if (launcherRef.current?.contains(event.target as Node)) return;
          leftByOutsideRef.current = true;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          // Skip-to-content wins; a click or Tab elsewhere keeps focus there;
          // otherwise back to what opened the panel.
          const target =
            focusAfterCloseRef.current ??
            (leftByOutsideRef.current ? null : openerRef.current ?? launcherRef.current);
          focusAfterCloseRef.current = null;
          leftByOutsideRef.current = false;
          if (target?.isConnected) target.focus();
        }}
        className={cn(
          "fixed inset-x-0 bottom-0 z-[60] flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl border border-border bg-background text-foreground shadow-2xl focus:outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 sm:start-auto sm:bottom-auto sm:top-20 sm:max-h-[calc(100dvh-6rem)] sm:w-[25rem] sm:max-w-[calc(100vw-6rem)] sm:rounded-2xl print:hidden",
          // Beside the floating button, on whichever side it was dragged to, so
          // it stays visible to close the panel again.
          !showLauncher ? "sm:end-4" : launcherPosition?.side === "start" ? "sm:start-20 sm:end-auto" : "sm:end-20",
        )}
      >
        <RememberOpener into={openerRef} />
        <div className="flex items-start gap-3 border-b border-border/60 p-4 sm:p-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <PersonStanding aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="text-lg font-semibold leading-7 text-foreground">
              {t("panelTitle")}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm leading-5 text-muted-foreground">
              {t("panelDescription")}
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close
            aria-label={t("closePanel")}
            className="-me-1 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-foreground/70 hover:bg-muted hover:text-foreground"
          >
            <X aria-hidden="true" className="size-5" />
          </DialogPrimitive.Close>
        </div>

        <TabsPrimitive.Root defaultValue="display" dir={dir} className="flex min-h-0 flex-1 flex-col">
          <TabsPrimitive.List
            aria-label={t("panelTitle")}
            className="flex shrink-0 gap-1 border-b border-border/60 px-2 py-2 sm:px-3"
          >
            {tabs.map(({ value, icon: Icon, label }) => (
              <TabsPrimitive.Trigger
                key={value}
                value={value}
                className="flex min-h-11 min-w-0 flex-auto flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary sm:flex-row sm:gap-1.5"
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="max-w-full truncate">{label}</span>
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            <TabsPrimitive.Content value="display">
              <DisplaySection />
            </TabsPrimitive.Content>
            <TabsPrimitive.Content value="navigation">
              <NavigationSection
                onSkipToMain={skipToMain}
                onResetLauncher={showLauncher ? () => saveLauncherPosition(null) : undefined}
                launcherMoved={launcherPosition !== null}
              />
            </TabsPrimitive.Content>
            <TabsPrimitive.Content value="content">
              <ContentSection />
            </TabsPrimitive.Content>
            <TabsPrimitive.Content value="help">
              <HelpSection locale={locale} onNavigate={close} />
            </TabsPrimitive.Content>
          </div>
        </TabsPrimitive.Root>

        {statementPublished && (
          <div className="shrink-0 border-t border-border/60 p-3 sm:p-4">
            <Link
              href={`/${locale}/accessibility`}
              onClick={close}
              className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 hover:bg-primary/10"
            >
              <ScrollText aria-hidden="true" className="size-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-primary">{t("statementLink")}</span>
                <span className="block text-xs leading-5 text-muted-foreground">{t("statementHint")}</span>
              </span>
              <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-primary rtl:-scale-x-100" />
            </Link>
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  );
}
