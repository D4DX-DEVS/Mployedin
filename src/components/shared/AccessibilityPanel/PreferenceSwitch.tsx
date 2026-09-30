"use client";

import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface PreferenceSwitchProps {
  icon: LucideIcon;
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** One on/off preference. The whole label toggles it, not just the small switch. */
export function PreferenceSwitch({ icon: Icon, label, hint, checked, onCheckedChange }: PreferenceSwitchProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-foreground/70" />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        {/* Inside the label so a tap on it toggles too; aria-hidden so it is the
            switch's description, not a second read-out in its name. */}
        <span id={hintId} aria-hidden="true" className="block text-xs leading-5 text-muted-foreground">
          {hint}
        </span>
      </label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={hintId}
        className="mt-1"
      />
    </div>
  );
}
