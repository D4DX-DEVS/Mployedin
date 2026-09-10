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

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideClose?: boolean
    /** On mobile, render as bottom sheet sliding up from bottom; centered dialog on sm+. Default true; pass false for centered dialog on all screens. */
    mobileSheet?: boolean
  }
>(({ className, children, hideClose, mobileSheet = true, ...props }, ref) => {
  const tCommon = useTranslations("common");
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
  return (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-[10000] grid gap-3 overflow-y-auto overscroll-contain border border-border bg-background p-4 shadow-2xl shadow-black/10 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:gap-4 sm:p-6",
        /* Only when the caller named no width of its own. */
        !declaresMaxWidth && (mobileSheet ? "sm:max-w-lg" : "max-w-lg"),
        /* The phone sheet is edge-to-edge by design, so a caller width that is
           narrower than a small tablet must not shrink it into a floating card
           down there — it applies from `sm` up, where the dialog is centred. */
        mobileSheet && "max-sm:max-w-none",
        mobileSheet
          ? "inset-x-0 bottom-0 mx-auto max-h-[85dvh] w-full rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:inset-x-auto sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:pb-6 sm:data-[state=closed]:zoom-out-[0.97] sm:data-[state=open]:zoom-in-[0.97] sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]"
          : "left-[50%] top-[50%] max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] translate-x-[-50%] translate-y-[-50%] rounded-2xl data-[state=closed]:zoom-out-[0.97] data-[state=open]:zoom-in-[0.97] data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        className
      )}
      {...props}
    >
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
}
