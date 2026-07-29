"use client";

import { POSTER_TYPES } from "@/lib/composer/types";
import type { PosterType, PosterTypeAll } from "@/lib/composer/types";
import {
  Briefcase, Users, AlertTriangle, DoorOpen,
  Megaphone, Calendar, GraduationCap, Smartphone,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Briefcase, Users, AlertTriangle, DoorOpen,
  Megaphone, Calendar, GraduationCap, Smartphone,
};

interface PosterTypeSelectorProps {
  selected: PosterType;
  onSelect: (type: PosterType) => void;
}

export function PosterTypeSelector({ selected, onSelect }: PosterTypeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {POSTER_TYPES.map((type) => {
        const Icon = ICON_MAP[type.icon];
        const isSelected = selected === type.id;
        const isAvailable = type.available;

        return (
          <button
            key={type.id}
            type="button"
            disabled={!isAvailable}
            onClick={() => isAvailable && onSelect(type.id as PosterType)}
            className={`
              relative flex flex-col items-center gap-2 rounded-xl border-2 p-3 sm:p-4 text-center transition-all
              ${isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40"}
              ${!isAvailable ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
          >
            {isSelected && (
              <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            {!isAvailable && (
              <span className="absolute top-1 right-1 text-[10px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                Soon
              </span>
            )}
            {Icon && <Icon className="h-6 w-6 text-muted-foreground" />}
            <div>
              <p className="text-xs font-semibold">{type.label}</p>
              <p className="text-[10px] text-muted-foreground">{type.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
