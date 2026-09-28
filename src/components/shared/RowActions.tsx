"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown, Loader2, MoreHorizontal, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface RowAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect?: () => void;
  href?: string;
  /** Quick disclosure buttons (Show details): their aria-expanded state. */
  expanded?: boolean;
  /** Opens `href` in a new tab (CVs, external files). */
  external?: boolean;
  disabled?: boolean;
  /** Swaps the icon for a spinner while the action runs. */
  pending?: boolean;
  /** Icon tint, e.g. "text-emerald-600". */
  iconClassName?: string;
  /** Grouped last in the menu, below a separator, in the destructive colour. */
  destructive?: boolean;
  /**
   * Quick buttons: the icon alone, label as tooltip + accessible name. For
   * icons nobody misreads — the pen for Edit, the bin for Delete (owner,
   * 2026-09-28: "the pen icon is understood").
   */
  iconOnly?: boolean;
}

/**
 * A "pick one" control — the row's status — shown in plain sight as the current
 * value with a chevron: one click opens the options, a second picks one. It was
 * a sub-menu of More first, which made a status change three clicks.
 */
export interface RowPicker {
  /** Accessible name, e.g. "Change status for Hana Youssef". */
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  /** What the trigger shows — typically <StatusBadge status={value} />. */
  display?: ReactNode;
  disabled?: boolean;
  pending?: boolean;
}

interface RowActionsProps {
  /** Record name: heads the menu and names the More button for screen readers. */
  name: string;
  /** One or two everyday actions shown as buttons (labelled unless iconOnly). Never destructive. */
  quick?: readonly RowAction[];
  /** The row's status (or similar) as an inline pick-one control, first in the row. */
  picker?: RowPicker;
  /** Everything else, behind a "…" More button. */
  menu?: readonly RowAction[];
  /**
   * Where quick-action labels start showing again: "xl" (1280px), or "wide"
   * (1440px) for tables with so many columns that the labels push the actions
   * out of the panel at 1280px.
   */
  labelsFrom?: "xl" | "wide";
  className?: string;
}

// Same visibility rule as TableActionLink: phone cards and wide tables show the
// text; the sm–xl band keeps the icon, with the label as tooltip + aria-label.
// `data-table-action` opts out of the phone-card rule that paints `title` as a
// second label (globals.css, responsive-card-table).
// `not-sr-only` resets white-space to normal, so nowrap lives on an inner span.
const LABEL_CLASS = {
  xl: "inline sm:sr-only xl:not-sr-only",
  // rem, not px: Tailwind v4 orders a px breakpoint before `sm:` (rem), so
  // `sm:sr-only` won and the label never came back.
  wide: "inline sm:sr-only min-[90rem]:not-sr-only",
} as const;

function ActionIcon({ icon, pending, className }: { icon: LucideIcon; pending?: boolean; className?: string }) {
  const Icon = pending ? Loader2 : icon;
  return <Icon className={cn("h-4 w-4", pending && "animate-spin", className)} aria-hidden="true" />;
}

// DropdownMenuItem mutes every direct child svg (`[&>svg]:text-muted-foreground`),
// which outweighs a tint class on the icon itself. The span keeps the icon out
// of that selector, so a tint (or the destructive red) actually shows.
function MenuIcon({ action }: { action: Pick<RowAction, "icon" | "pending" | "iconClassName" | "destructive"> }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      <ActionIcon
        icon={action.icon}
        pending={action.pending}
        className={action.destructive ? "text-destructive" : action.iconClassName ?? "text-muted-foreground"}
      />
    </span>
  );
}

/**
 * A pick-one value — a row's status, a user's role — as a pill: the current
 * value and a chevron. One click opens the options, the second picks one.
 */
export function InlinePicker({ name, picker, align = "end" }: { name: string; picker: RowPicker; align?: "start" | "end" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={picker.disabled || picker.pending}
          aria-label={picker.label}
          title={picker.label}
          data-table-action=""
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-border/60 bg-card ps-1.5 pe-2 text-sm shadow-sm shadow-black/[0.04] transition-colors hover:border-border hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
        >
          {picker.display ?? <span className="ps-1.5">{picker.options.find((o) => o.value === picker.value)?.label ?? picker.value}</span>}
          {picker.pending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={picker.value} onValueChange={picker.onChange}>
          {picker.options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function QuickButton({ action, labelClass }: { action: RowAction; labelClass: string }) {
  const body = (
    <>
      <ActionIcon
        icon={action.icon}
        pending={action.pending}
        className={action.destructive ? "text-destructive" : action.iconClassName}
      />
      <span className={action.iconOnly ? "sr-only" : labelClass}><span className="whitespace-nowrap">{action.label}</span></span>
    </>
  );
  const className = cn(
    "h-9 rounded-xl",
    action.iconOnly ? "w-9 p-0" : "px-2.5",
    action.destructive && "text-destructive hover:bg-destructive/5 hover:text-destructive",
  );
  return action.href ? (
    <Button asChild variant="outline" size="sm" className={className}>
      <Link
        href={action.href}
        aria-label={action.label}
        title={action.label}
        data-table-action=""
        {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {body}
      </Link>
    </Button>
  ) : (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={action.onSelect}
      disabled={action.disabled || action.pending}
      aria-label={action.label}
      aria-expanded={action.expanded}
      title={action.label}
      data-table-action=""
    >
      {body}
    </Button>
  );
}

/**
 * Row actions for list tables: the everyday action(s) in plain sight, the rest
 * in a "…" menu with destructive items last. Replaces a lone `…` that hid every
 * action — including the one a row most obviously needs (e.g. "Assign agent"
 * on a row that shows "No agent").
 */
export function RowActions({ name, quick = [], picker, menu = [], labelsFrom = "xl", className }: RowActionsProps) {
  const t = useTranslations("common");
  // A "…" that opens onto a single item only hides it (owner, 2026-09-28):
  // that item becomes a button of its own, in its destructive colour if it
  // has one.
  const promoted = menu.length === 1 ? menu : [];
  const listed = menu.length === 1 ? [] : menu;
  const safe = listed.filter((action) => !action.destructive);
  const destructive = listed.filter((action) => action.destructive);

  return (
    <div className={cn("flex items-center justify-end gap-2", className)}>
      {picker && <InlinePicker name={name} picker={picker} />}

      {[...quick, ...promoted].map((action) => (
        <QuickButton key={action.key} action={action} labelClass={LABEL_CLASS[labelsFrom]} />
      ))}

      {listed.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* Icon-only on purpose (owner, 2026-09-28): the "…" reads as "more"
                on its own; the accessible name still says whose actions these are. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-9 rounded-xl p-0"
              aria-label={t("moreActionsFor", { name })}
              title={t("more")}
              data-table-action=""
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {safe.map((action) => <RowMenuItem key={action.key} action={action} />)}
            {destructive.length > 0 && safe.length > 0 && <DropdownMenuSeparator />}
            {destructive.map((action) => <RowMenuItem key={action.key} action={action} />)}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function RowMenuItem({ action }: { action: RowAction }) {
  const className = action.destructive ? "text-destructive focus:text-destructive" : undefined;
  if (action.href) {
    return (
      <DropdownMenuItem asChild disabled={action.disabled} className={className}>
        <Link href={action.href} {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          <MenuIcon action={action} />
          {action.label}
        </Link>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem onClick={action.onSelect} disabled={action.disabled || action.pending} className={className}>
      <MenuIcon action={action} />
      {action.label}
    </DropdownMenuItem>
  );
}
