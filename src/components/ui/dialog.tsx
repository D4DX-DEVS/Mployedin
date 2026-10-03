"use client"

import * as React from "react"
import { useTranslations } from "next-intl";
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[9999] bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/* Anything a person can type into or pick from. Radix Select's trigger is a
   `role="combobox"` button, so it counts without a native field. */
const EDITABLE_FIELD =
  'input:not([type="hidden"]), textarea, select, [contenteditable=""], [contenteditable="true"], [role="combobox"]'

/** What had focus as a dialog opens. Read during render, because a field with
    `autoFocus` takes focus at commit and Radix then skips onOpenAutoFocus. A
    menu item leaves with its menu, so the menu's trigger stands in for it. */
function currentOpener(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  const triggerId = active.closest('[role="menu"]')?.getAttribute("aria-labelledby");
  return (triggerId && document.getElementById(triggerId)) || active;
}

/** Mounts with the dialog content, so it runs once per opening. Exported for
    panels built on the primitive directly (the non-modal Accessibility panel). */
function RememberOpener({ into }: { into: React.MutableRefObject<HTMLElement | null> }) {
  const [opener] = React.useState(currentOpener);
  React.useLayoutEffect(() => {
    into.current = opener;
  }, [into, opener]);
  return null;
}

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideClose?: boolean
    overlayClassName?: string
    /** On mobile, render as bottom sheet sliding up from bottom; centered dialog on sm+. Default true; pass false for centered dialog on all screens. */
    mobileSheet?: boolean
    /** Whether a click (or focus move) outside closes the dialog. Left unset, a dialog holding an editable field stays open and a read-only one closes. */
    closeOnOutsideClick?: boolean
    /** "end": a full-height panel docked to the inline end (right in LTR, left in Arabic), for a record's workspace beside the list it came from. Ignores mobileSheet; full width on phones. */
    side?: "end"
  }
>(({ className, children, hideClose, overlayClassName, mobileSheet = true, closeOnOutsideClick, side, onInteractOutside, onCloseAutoFocus, ...props }, ref) => {
  const tCommon = useTranslations("common");
  /* A stray click on the backdrop used to close every dialog, so a half-filled
     create/edit form vanished with everything typed into it (admin Add
     Commission was the reported case; every role's CRUD dialogs shared it).
     A dialog holding a field now closes only through its own Cancel, ✕ or
     Escape. Checked at the moment of the click, not on mount, because
     multi-step dialogs swap their fields in and out. */
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const setContentRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );
  const handleInteractOutside: typeof onInteractOutside = (event) => {
    onInteractOutside?.(event);
    if (event.defaultPrevented) return;
    const keepOpen =
      closeOnOutsideClick === undefined
        ? Boolean(contentRef.current?.querySelector(EDITABLE_FIELD))
        : !closeOnOutsideClick;
    if (keepOpen) event.preventDefault();
  };
  /* Radix hands focus back on close only to a <DialogTrigger>, and nearly
     every dialog here is opened from state (a button's onClick), so closing one
     left keyboard focus on <body> and keyboard and screen-reader users lost
     their place. Remember what had focus when the dialog opened and go back to
     it, unless the caller handles onCloseAutoFocus itself or it is gone.
     <RememberOpener> fills the ref each time the content mounts. */
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const handleCloseAutoFocus: typeof onCloseAutoFocus = (event) => {
    onCloseAutoFocus?.(event);
    const opener = returnFocusRef.current;
    returnFocusRef.current = null;
    if (event.defaultPrevented || !opener?.isConnected) return;
    event.preventDefault();
    opener.focus({ preventScroll: true });
  };
  /* A dialog that asks for its own width has to get it.
     `cn()` is tailwind-merge, which only drops a conflicting utility when the
     variant prefix matches — so the default `sm:max-w-lg` used to survive
     alongside a caller's `max-w-4xl`, and, being emitted inside a media query
     further down the stylesheet, won on every viewport at or above 40rem. Every
     dialog declaring a bare width wider than `lg` therefore rendered at 32rem
     and clipped its own content (agent Exhibition Requests → View Details was
     the reported case; 19 call sites had it).
     Detecting the caller's width and leaving ours out is what makes the
     declared width authoritative, rather than hoping the merge resolves it. */
  const declaresMaxWidth = /(?:^|\s)(?:[a-z-]+:)*max-w-/.test(className ?? "");
  const docked = side === "end";
  return (
  <DialogPortal>
    <DialogOverlay className={overlayClassName} />
    <DialogPrimitive.Content
      ref={setContentRef}
      onInteractOutside={handleInteractOutside}
      onCloseAutoFocus={handleCloseAutoFocus}
      className={cn(
        "fixed z-[10000] grid gap-3 overflow-y-auto overscroll-contain border border-border bg-background p-4 shadow-2xl shadow-black/10 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:gap-4 sm:p-6",
        /* Only when the caller named no width of its own. */
        !docked && !declaresMaxWidth && (mobileSheet ? "sm:max-w-lg" : "max-w-lg"),
        /* The phone sheet is edge-to-edge by design, so a caller width that is
           narrower than a small tablet must not shrink it into a floating card
           down there — it applies from `sm` up, where the dialog is centred. */
        !docked && mobileSheet && "max-sm:max-w-none",
        docked
          ? "inset-y-0 end-0 flex h-dvh max-h-dvh w-full flex-col gap-0 overflow-hidden rounded-none border-y-0 border-e-0 p-0 sm:max-h-dvh sm:max-w-[32rem] sm:gap-0 sm:p-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right rtl:data-[state=closed]:slide-out-to-left rtl:data-[state=open]:slide-in-from-left"
          : mobileSheet
          ?"inset-x-0 bottom-0 mx-auto max-h-[85dvh] w-full rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:inset-x-auto sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:pb-6 sm:data-[state=closed]:zoom-out-[0.97] sm:data-[state=open]:zoom-in-[0.97] sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]"
          : "left-[50%] top-[50%] max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] translate-x-[-50%] translate-y-[-50%] rounded-2xl data-[state=closed]:zoom-out-[0.97] data-[state=open]:zoom-in-[0.97] data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        className
      )}
      {...props}
    >
      <RememberOpener into={returnFocusRef} />
      {children}
      {!hideClose && (
        <DialogPrimitive.Close className="absolute end-4 top-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background shadow-sm ring-offset-background transition-all duration-150 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground sm:h-8 sm:w-8">
          <X className="h-4 w-4" />
          <span className="sr-only">{tCommon("close")}</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
  );
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-start",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  RememberOpener,
}
