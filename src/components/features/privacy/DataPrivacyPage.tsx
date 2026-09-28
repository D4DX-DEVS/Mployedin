"use client";

import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataPrivacyPanel } from "./DataPrivacyPanel";

/**
 * The Data & Privacy page every signed-in role gets. Staff workspaces open
 * with the WorkspaceHeader; job seekers with the plain PageHeader their other
 * routes use.
 */
export function DataPrivacyPage({ variant }: { variant: "workspace" | "seeker" }) {
  const t = useTranslations("dataPrivacy");
  return (
    <div className="page-container">
      {variant === "workspace" ? (
        <WorkspaceHeader title={t("pageTitle")} context={t("pageDescription")} icon={ShieldCheck} />
      ) : (
        <PageHeader title={t("pageTitle")} description={t("pageDescription")} />
      )}
      <section className="workspace-panel-surface rounded-2xl p-4 sm:p-6">
        <DataPrivacyPanel />
      </section>
    </div>
  );
}
