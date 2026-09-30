"use client";

import { useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { PersonStanding } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LauncherPosition, LauncherSide } from "./useLauncherPosition";

/** Pointer travel before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD_PX = 6;

interface LauncherProps {
  ref?: React.Ref<HTMLButtonElement>;
  label: string;
  hint: string;
  position: LauncherPosition | null;
  onMove: (position: LauncherPosition) => void;
}

/**
 * The floating Accessibility button. Pinned to the viewport; a visitor can
 * drag it up or down either side and it snaps to the nearer edge, the way
 * accessibility buttons on other sites move out of the way. A plain press
 * still opens the panel, and the panel offers "Reset position" for anyone who
 * cannot drag.
 */
export function Launcher({ ref, label, hint, position, onMove }: LauncherProps) {
  const press = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [dragAt, setDragAt] = useState<{ x: number; y: number } | null>(null);

  let style: React.CSSProperties | undefined;
  if (dragAt) {
    // Follows the pointer; inline styles outrank the resting classes.
    style = { left: dragAt.x, top: dragAt.y, right: "auto", bottom: "auto", translate: "-50% -50%" };
  } else if (position) {
    style = {
      top: `clamp(5rem, ${position.top * 100}%, calc(100% - 4rem))`,
      bottom: "auto",
      translate: "0 -50%",
      insetInlineStart: position.side === "start" ? "1rem" : "auto",
      insetInlineEnd: position.side === "end" ? "1rem" : "auto",
    };
  }

  return (
    <DialogPrimitive.Trigger
      ref={ref}
      aria-label={label}
      title={hint}
      style={style}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        press.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
        // Captured at once: a quick flick leaves the 52px button before the
        // first move event, which would then go to whatever is underneath.
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = press.current;
        if (!current || current.id !== event.pointerId) return;
        if (!current.moved) {
          if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < DRAG_THRESHOLD_PX) return;
          current.moved = true;
        }
        setDragAt({ x: event.clientX, y: event.clientY });
      }}
      onPointerUp={(event) => {
        const current = press.current;
        press.current = null;
        if (!current?.moved) return;
        suppressClick.current = true;
        setDragAt(null);
        // Snap to the nearer edge, stored as start/end so it mirrors in Arabic.
        const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
        const onLeft = event.clientX < window.innerWidth / 2;
        const side: LauncherSide = onLeft !== rtl ? "start" : "end";
        onMove({ side, top: event.clientY / window.innerHeight });
      }}
      onPointerCancel={() => {
        press.current = null;
        setDragAt(null);
      }}
      onClick={(event) => {
        // The click that ends a drag must not also open the panel.
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
      }}
      className={cn(
        "fixed bottom-[max(1rem,env(safe-area-inset-bottom))] end-4 z-40 flex size-12 touch-none select-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-white/90 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring print:hidden sm:bottom-auto sm:top-1/2 sm:size-13 sm:-translate-y-1/2",
        // On a phone's first visit the cookie banner sits over the bottom corner,
        // so the button could not be reached until the banner was answered. Rise
        // above it by the clearance globals.css already reserves for the banner.
        "max-sm:[:root[data-cookie-banner=visible]_&]:bottom-[calc(7rem+env(safe-area-inset-bottom))]",
        dragAt ? "cursor-grabbing scale-105 shadow-2xl" : "cursor-pointer motion-safe:transition-colors",
      )}
    >
      <PersonStanding aria-hidden="true" className="size-6" />
    </DialogPrimitive.Trigger>
  );
}
