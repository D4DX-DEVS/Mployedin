"use client";

/* ── Lightweight drag-to-reorder primitives (built on @dnd-kit) ──
   Used by the CV builder to reorder sections and entries within a section.
*/

import React from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/** Reorder a list of stable string ids and call back with the new order. */
export function SortableList({
  ids, onReorder, children, className,
}: {
  ids: string[];
  onReorder: (next: string[]) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={className}>{children}</div>
      </SortableContext>
    </DndContext>
  );
}

/**
 * A sortable row. Renders its children and a drag handle. By default the handle
 * floats on the left edge (FlowCV style). Pass `handleClassName` to reposition.
 */
export function SortableItem({
  id, children, className, handleClassName, handleLabel,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  handleClassName?: string;
  handleLabel?: string;
}) {
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 opacity-90 shadow-lg", className)}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={handleLabel ?? "Drag to reorder"}
        title={handleLabel ?? "Drag to reorder"}
        className={cn(
          "absolute inset-y-0 left-0 z-10 flex w-7 cursor-grab touch-none select-none items-center justify-center rounded-l-lg border-r border-transparent bg-muted/30 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isDragging && "bg-muted text-foreground",
          handleClassName,
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}
