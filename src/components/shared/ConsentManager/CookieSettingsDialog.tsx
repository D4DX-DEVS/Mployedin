"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ConsentState } from "@/lib/consent/state";
import { purposeKeys, type ItemCopy, type SettingsCopy } from "@/lib/consent/copy";

export interface ConsentChoice {
  preferences: boolean;
  media: boolean;
}

// [LEGAL] Owner decision D1 (APPEARANCE_EXCEPTION_ENABLED): display settings are
// remembered until the visitor objects, so the switch starts on; media needs an opt-in.
export const DEFAULT_CHOICE: ConsentChoice = { preferences: true, media: false };

export const REJECT_ALL: ConsentChoice = { preferences: false, media: false };
export const ACCEPT_ALL: ConsentChoice = { preferences: true, media: true };

/**
 * Reject all and Accept all share one component, variant, size and className
 * wherever they appear: rejecting must be as easy and as visible as accepting
 * (ICO storage and access technologies guidance). [LEGAL]
 */
export const CHOICE_BUTTON_CLASS = "min-h-11 px-3 font-semibold";

// [LEGAL] plan table 1c: what YouTube already received is Google's to delete; we point to its controls.
const GOOGLE_PRIVACY_CONTROLS_URL = "https://myaccount.google.com/data-and-privacy";

export interface CookieSettingsDialogLabels extends SettingsCopy {
  policy: string;
  rejectAll: string;
  acceptAll: string;
  /** Screen-reader suffix for the new-tab link (common.opensInNewTab). Not part of the hashed copy. */
  newTab?: string;
}

interface CookieSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The stored choice, or null before one is made. */
  current: ConsentState | null;
  labels: CookieSettingsDialogLabels;
  items: ItemCopy;
  policyHref: string;
  saving: boolean;
  onSave: (choice: ConsentChoice) => void;
}

interface CategoryProps {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Shown beside a switch that can't be changed. */
  status?: string;
  purposes: string[];
  items: ItemCopy;
  ifOff?: string;
  undo?: ReactNode;
  /**
   * Put the itemised list behind a "Show what this covers (N)" button, closed
   * to begin with. Only Strictly necessary uses it: its ~13 lines made the
   * dialog about twice a phone's height, with the switches far below. Closed on
   * desktop too: open, it pushes the buttons below the fold at 1280x800.
   */
  collapsible?: { show: string; hide: string };
}

/** One category: the switch, what it covers (from REGISTRY), and what turning it off means. */
function Category({ title, description, checked, disabled, onCheckedChange, status, purposes, items, ifOff, undo, collapsible }: CategoryProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const listId = `${id}-items`;
  const [expanded, setExpanded] = useState(false);
  const hidden = Boolean(collapsible) && !expanded;
  return (
    <section className="rounded-xl border border-border/70 bg-muted/30 p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <label htmlFor={id} className={cn("min-w-0 flex-1", !disabled && "cursor-pointer")}>
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          {/* Inside the label so a tap on it toggles too; aria-hidden so it is the
              switch's description, not part of its name. */}
          <span id={hintId} aria-hidden="true" className="mt-0.5 block text-xs leading-5 text-muted-foreground">
            {description}
          </span>
        </label>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          {status && <span className="text-xs font-medium text-muted-foreground">{status}</span>}
          {/* Not inside a <form>, so Radix renders no hidden input (the RTL
              overflow trap in globals.css only applies to form switches). */}
          <Switch
            id={id}
            checked={checked}
            disabled={disabled}
            onCheckedChange={onCheckedChange}
            aria-describedby={hintId}
          />
        </div>
      </div>
      {collapsible && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((open) => !open)}
          className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-md text-xs font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:min-h-8"
        >
          {expanded ? collapsible.hide : `${collapsible.show} (${purposes.length})`}
          <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
        </button>
      )}
      {/* Always rendered, so aria-controls has something to point at; `hidden` takes it out of the layout and the accessibility tree. */}
      <ul
        id={listId}
        aria-label={title}
        hidden={hidden}
        className="mt-2 list-disc space-y-0.5 ps-5 text-xs leading-5 text-muted-foreground"
      >
        {purposes.map((key) => (
          <li key={key}>{items[key] ?? key}</li>
        ))}
      </ul>
      {ifOff && <p className="mt-2 text-xs leading-5 text-foreground/80">{ifOff}</p>}
      {undo && <p className="mt-1 text-xs leading-5 text-muted-foreground">{undo}</p>}
    </section>
  );
}

/** Lives inside DialogContent, which unmounts on close, so every opening starts from the stored choice. */
function SettingsBody({ current, labels, items, saving, onSave }: Omit<CookieSettingsDialogProps, "open" | "onOpenChange" | "policyHref">) {
  const [choice, setChoice] = useState<ConsentChoice>(() =>
    current ? { preferences: current.preferences, media: current.media } : DEFAULT_CHOICE,
  );

  return (
    <>
      <div className="space-y-3">
        <Category
          title={labels.necessaryTitle}
          description={labels.necessaryDescription}
          checked
          disabled
          status={labels.alwaysOn}
          purposes={purposeKeys("necessary")}
          items={items}
          collapsible={{ show: labels.showCovered, hide: labels.hideCovered }}
        />
        <Category
          title={labels.preferencesTitle}
          description={labels.preferencesDescription}
          checked={choice.preferences}
          onCheckedChange={(preferences) => setChoice((c) => ({ ...c, preferences }))}
          purposes={purposeKeys("preferences")}
          items={items}
          ifOff={labels.preferencesIfOff}
          undo={labels.preferencesUndo}
        />
        <Category
          title={labels.mediaTitle}
          description={labels.mediaDescription}
          checked={choice.media}
          onCheckedChange={(media) => setChoice((c) => ({ ...c, media }))}
          purposes={purposeKeys("media")}
          items={items}
          ifOff={labels.mediaIfOff}
          undo={
            <>
              {labels.mediaUndo}{" "}
              <a
                href={GOOGLE_PRIVACY_CONTROLS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2 hover:text-primary"
              >
                {labels.mediaGoogleControls}
                {labels.newTab && <span className="sr-only"> {labels.newTab}</span>}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </>
          }
        />
      </div>

      {current && (
        <p className="text-xs text-muted-foreground">
          <span>{labels.reference}:</span>{" "}
          {/* An id to quote to support; LTR inside Arabic text, selectable in one go. */}
          <span dir="ltr" className="select-all break-all font-mono text-foreground">
            {current.id}
          </span>
        </p>
      )}

      {/* The dialog scrolls (its bar is hidden on purpose), and at 1280x800 it is taller than the
          window, so the three actions stick to its bottom edge at every size: rejecting must be
          as easy as accepting, not behind a scroll the visitor may not know about (ICO). A sticky
          box stops at the scroller's padding, not its edge, so bottom/margin are pulled out by the
          dialog's own bottom padding (max(1rem, safe area) on the phone sheet, 1.5rem from sm, see
          DialogContent) to sit flush, with no scrolled text showing underneath; -mx does the same
          sideways. Opaque background and a top rule so nothing shows through. */}
      <div
        data-cookie-dialog-footer=""
        className="sticky bottom-[calc(-1*max(1rem,env(safe-area-inset-bottom)))] z-10 -mx-4 mb-[calc(-1*max(1rem,env(safe-area-inset-bottom)))] grid grid-cols-2 gap-2 border-t border-border bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:flex sm:justify-end sm:px-6 sm:pb-4"
      >
        {/* Reject all and Accept all in two equal grid columns of their own, so they are the same width at
            every size and in every language (ICO: equal prominence); Save sits beside them from sm, below at 375. */}
        <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1">
          <Button variant="outline" size="sm" className={CHOICE_BUTTON_CLASS} disabled={saving} onClick={() => onSave(REJECT_ALL)}>
            {labels.rejectAll}
          </Button>
          <Button variant="outline" size="sm" className={CHOICE_BUTTON_CLASS} disabled={saving} onClick={() => onSave(ACCEPT_ALL)}>
            {labels.acceptAll}
          </Button>
        </div>
        <Button size="sm" className="col-span-2 min-h-11 px-4 font-semibold sm:col-span-1" disabled={saving} onClick={() => onSave(choice)}>
          {labels.save}
        </Button>
      </div>
    </>
  );
}

/**
 * Cookie settings: Strictly necessary (always on, itemised from REGISTRY),
 * "Remember my display settings" (on unless the visitor objects, D1) and
 * YouTube videos (off until chosen). Opened by Customise on the banner and by
 * every CookieSettingsLink, before or after a choice.
 */
export function CookieSettingsDialog({ open, onOpenChange, policyHref, ...body }: CookieSettingsDialogProps) {
  const { labels } = body;
  return (
    <Dialog open={open} onOpenChange={(next) => !body.saving && onOpenChange(next)}>
      {/* The switches are unsaved choices: a stray backdrop click must not
          throw them away (the dialog outside-click convention; ✕ and Escape
          still close). */}
      {/* Still scrolls (wheel, touch, keyboard); only the bar is hidden. */}
      <DialogContent className="scrollbar-none sm:max-w-xl" closeOnOutsideClick={false}>
        <DialogHeader className="pe-12 sm:pe-10">
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>
            {labels.description}{" "}
            <Link href={policyHref} className="font-medium underline underline-offset-2 hover:text-foreground">
              {labels.policy}
            </Link>
          </DialogDescription>
        </DialogHeader>
        <SettingsBody {...body} />
      </DialogContent>
    </Dialog>
  );
}
