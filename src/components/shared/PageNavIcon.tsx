"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { getIcon, type IconName } from "@/lib/nav/iconRegistry";

// Keep this module free of nav config imports: every page header imports it,
// public pages included. DashboardShell resolves the name (lib/nav/pageNavIcon).
const PageNavIconContext = createContext<IconName | null>(null);

export function PageNavIconProvider({ icon, children }: { icon: IconName | null; children: ReactNode }) {
  return <PageNavIconContext.Provider value={icon}>{children}</PageNavIconContext.Provider>;
}

/** Header identity icon for a page that did not pass its own: the route's sidebar icon. */
export function PageNavIcon({ className }: { className?: string }) {
  const name = useContext(PageNavIconContext);
  const Icon = name ? getIcon(name) : Sparkles;
  return <Icon className={className} />;
}
