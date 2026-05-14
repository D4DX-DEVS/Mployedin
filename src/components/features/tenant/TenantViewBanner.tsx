"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { csrfFetch } from "@/lib/security/csrf-client";
import type { UserRole } from "@/types/user";

const ROLE_LABELS: Partial<Record<UserRole, string>> = {
  admin: "Admin",
  super_agent: "Super Agent",
  agent: "Agent",
};

const ROLE_PATHS: Partial<Record<UserRole, string>> = {
  admin: "/admin",
  super_agent: "/super-agent",
  agent: "/agent",
};

interface TenantViewBannerProps {
  companyName: string;
  actorRole: UserRole;
  locale: string;
}

export function TenantViewBanner({
  companyName,
  actorRole,
  locale,
}: TenantViewBannerProps) {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  async function handleExit() {
    setExiting(true);
    try {
      await csrfFetch("/api/tenant/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exit: true }),
      });
    } catch {
      // Best-effort — redirect regardless
    }
    // Navigate back to the actor's own dashboard
    const basePath = ROLE_PATHS[actorRole] ?? "/";
    router.push(`/${locale}${basePath}`);
    router.refresh();
  }

  const roleLabel = ROLE_LABELS[actorRole] ?? "Dashboard";

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-50 px-4 py-2 text-sm dark:bg-amber-950/30 dark:border-amber-500/30">
      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 min-w-0">
        <Building2 className="h-4 w-4 shrink-0" />
        <span className="font-medium truncate">
          Viewing as employer:{" "}
          <strong className="font-semibold">{companyName}</strong>
        </span>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="shrink-0 border-amber-500/60 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
        onClick={handleExit}
        disabled={exiting}
      >
        {exiting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ArrowLeft className="h-3.5 w-3.5" />
        )}
        <span className="ml-1.5">Back to {roleLabel}</span>
      </Button>
    </div>
  );
}
