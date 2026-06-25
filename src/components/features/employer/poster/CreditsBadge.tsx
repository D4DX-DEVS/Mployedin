"use client";

import { Zap } from "lucide-react";

interface CreditsBadgeProps {
  credits: { used: number; limit: number; remaining: number; resetDate: string; plan: string } | undefined;
}

export function CreditsBadge({ credits }: CreditsBadgeProps) {
  if (!credits) return null;

  return (
    <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 shadow-sm">
      <Zap className="h-4 w-4 text-primary" />
      <span className="text-sm font-semibold text-foreground">
        Credits: {credits.remaining} / {credits.limit}
      </span>
    </div>
  );
}
