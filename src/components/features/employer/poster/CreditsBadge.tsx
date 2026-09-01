"use client";

import { Zap } from "lucide-react";

interface CreditsBadgeProps {
  credits: { used: number; limit: number; remaining: number; resetDate: string; plan: string } | undefined;
}

export function CreditsBadge({ credits }: CreditsBadgeProps) {
  if (!credits) return null;

  return (
    <div className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1.5 shadow-sm sm:gap-2 sm:px-4 sm:py-2">
      <Zap className="h-4 w-4 text-primary" />
      <span className="text-xs font-semibold text-foreground sm:text-sm">
        Credits: {credits.remaining} / {credits.limit}
      </span>
    </div>
  );
}
