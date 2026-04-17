"use client";

import type { ReactNode } from "react";

export function SuperAgentShell({ children }: { children: ReactNode }) {
  return (
    <div className="super-agent-legacy-surface">
      {children}
    </div>
  );
}
