"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/shared/ThemeProvider";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { isMounted, resolvedTheme, toggleTheme } = useTheme();

  if (!isMounted) {
    return <div aria-hidden className={cn("h-11 w-11 shrink-0", className)} />;
  }

  const nextModeLabel = resolvedTheme === "dark" ? "light" : "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn(
        "h-11 w-11 rounded-full border-border/60 bg-background/80 text-foreground shadow-sm shadow-black/[0.04] backdrop-blur hover:bg-accent/70",
        className
      )}
      onClick={toggleTheme}
      aria-label={`Switch to ${nextModeLabel} mode`}
      title={`Switch to ${nextModeLabel} mode`}
    >
      {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
