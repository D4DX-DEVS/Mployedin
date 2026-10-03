"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Mail, MapPin, MessageCircle, MessageSquarePlus, Pencil, Phone, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/ErrorState";
import { cn } from "@/lib/utils";
import { LeadActionsMenu, type LeadActionHandlers, type LeadActionState } from "./LeadActionsMenu";
import { LeadOverview } from "./LeadOverview";
import { LeadTimeline } from "./LeadTimeline";
import { whatsappHref, type Lead, type LeadStatus, type StageStyle, type T } from "./leadShared";

export type WorkspaceTab = "overview" | "activity" | "notes";

/**
 * The Lead Workspace: a panel docked beside the board where a lead is actually
 * managed (owner's brief, 2026-10-02). The board stays for moving the
 * pipeline; this is for working one lead — its stage, contact, details,
 * follow-up, activity and notes.
 *
 * It reads the lead itself (GET /api/leads/[id]) so it can be opened from a
 * link (`?lead=<id>`) without the card being loaded, and refetches whenever
 * the page bumps `version` after a dialog it owns changed the lead.
 */
export function LeadWorkspace({
  leadId,
  tab,
  onTabChange,
  focusComposer,
  version,
  onClose,
  onLeadChanged,
  actions,
  state,
  stageConfig,
  exhibitionName,
  t,
  locale,
}: {
  leadId: string | null;
  tab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  /** Put the cursor in the Notes composer (opened via "Add note"). */
  focusComposer: boolean;
  version: number;
  onClose: () => void;
  /** The lead changed inside the workspace; the board should re-read. */
  onLeadChanged: () => void;
  actions: LeadActionHandlers;
  state: LeadActionState;
  stageConfig: Record<LeadStatus, StageStyle>;
  exhibitionName: (id?: string) => string | undefined;
  t: T;
  locale: string;
}) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<"missing" | "error" | null>(null);

  // Only the newest request may answer: opening lead B while lead A's fetch
  // is still running must not end with A's details under B's URL.
  const requestRef = useRef(0);
  const load = useCallback(async (id: string, quiet = false) => {
    const request = ++requestRef.current;
    const current = () => request === requestRef.current;
    if (!quiet) setLoading(true);
    setFailed(null);
    try {
      const res = await fetch(`/api/leads/${id}`);
      if (!current()) return;
      if (!res.ok) {
        setFailed(res.status === 404 || res.status === 403 ? "missing" : "error");
        return;
      }
      const next = await res.json();
      if (current()) setLead(next);
    } catch {
      if (current()) setFailed("error");
    } finally {
      if (current()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!leadId) { setLead(null); return; }
    // A different lead starts blank; a refresh of the same one keeps showing it.
    const sameLead = lead?._id === leadId;
    if (!sameLead) setLead(null);
    void load(leadId, sameLead);
    // `lead` is read only to decide quiet vs. blank; refetch on id or version.
     
  }, [leadId, version, load]);

  /** A write inside the workspace returned the new lead: show it, keep the
   *  agent name (only GET carries it), and tell the board. */
  const applyChange = (next: Lead) => {
    setLead((prev) => ({ ...next, assignedAgentName: next.assignedAgentName ?? prev?.assignedAgentName }));
    onLeadChanged();
  };
  const refetch = () => {
    if (leadId) void load(leadId, true);
    onLeadChanged();
  };

  const style = lead ? stageConfig[lead.status] : null;
  const notesCount = (lead?.activityLog ?? []).filter((a) => a.action === "note").length + (lead?.notes ? 1 : 0);

  return (
    <Dialog open={Boolean(leadId)} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent side="end" overlayClassName="!bg-black/20 backdrop-blur-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border/70 px-5 pb-3 pt-5 pe-28">
          {lead && style ? (
            <div className="flex items-start gap-3">
              <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", style.bgColor, style.color)}>
                <Building2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="min-w-0 truncate text-lg font-semibold">{lead.companyName}</DialogTitle>
                  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold [&_svg]:h-3 [&_svg]:w-3", style.bgColor, style.borderColor, style.color)}>
                    {style.icon}{style.label}
                  </span>
                </div>
                <DialogDescription className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-sm">
                  <span className="truncate">{lead.contactPerson}</span>
                  {(lead.country || lead.industry) && (
                    <>
                      <span aria-hidden="true">·</span>
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{[lead.country, lead.industry].filter(Boolean).join(" · ")}</span>
                    </>
                  )}
                </DialogDescription>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <DialogTitle className="sr-only">{t("leadWorkspaceTitle")}</DialogTitle>
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}
        </div>
        {lead && (
          <div className="absolute end-16 top-4 z-30 sm:end-14">
            <LeadActionsMenu lead={lead} actions={actions} state={state} t={t} className="h-11 w-11 sm:h-8 sm:w-8" />
          </div>
        )}

        {/* Body */}
        {failed ? (
          <div className="flex-1 p-6">
            {failed === "missing"
              ? <p className="text-sm text-muted-foreground">{t("leadNotFound")}</p>
              : <ErrorState onRetry={() => leadId && load(leadId)} />}
          </div>
        ) : !lead || loading ? (
          <div className="flex-1 space-y-4 p-5">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(value) => onTabChange(value as WorkspaceTab)} className="flex min-h-0 flex-1 flex-col gap-0">
            <TabsList className="mx-5 mt-3 grid shrink-0 grid-cols-3">
              <TabsTrigger value="overview">{t("tabOverview")}</TabsTrigger>
              <TabsTrigger value="activity">{t("tabActivity")}</TabsTrigger>
              <TabsTrigger value="notes">{notesCount > 0 ? t("tabNotesCount", { count: notesCount }) : t("tabNotes")}</TabsTrigger>
            </TabsList>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <TabsContent value="overview" className="mt-0">
                <LeadOverview
                  lead={lead}
                  exhibitionName={exhibitionName(lead.exhibitionId)}
                  stageConfig={stageConfig}
                  actions={actions}
                  canUpdate={state.canUpdate}
                  converting={state.convertingId === lead._id}
                  onLeadChange={applyChange}
                  t={t}
                  locale={locale}
                />
              </TabsContent>
              <TabsContent value="activity" className="mt-0">
                <LeadTimeline lead={lead} mode="activity" canWrite={state.canUpdate} onLogged={refetch} stageConfig={stageConfig} t={t} locale={locale} />
              </TabsContent>
              <TabsContent value="notes" className="mt-0">
                <LeadTimeline lead={lead} mode="notes" autoFocus={focusComposer} canWrite={state.canUpdate} onLogged={refetch} stageConfig={stageConfig} t={t} locale={locale} />
              </TabsContent>
            </div>
          </Tabs>
        )}

        {/* Footer */}
        {lead && !failed && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/70 px-5 py-3">
            {state.canUpdate && (
              <>
                <Button type="button" variant="outline" onClick={() => actions.edit(lead)} className="gap-1.5">
                  <Pencil className="h-4 w-4" />{t("editLead")}
                </Button>
                <Button type="button" variant="outline" onClick={() => onTabChange("notes")} className="gap-1.5">
                  <MessageSquarePlus className="h-4 w-4" />{t("addNote")}
                </Button>
              </>
            )}
            <SendMessageMenu lead={lead} t={t} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** WhatsApp, email or a call, through the agent's own apps — the platform
 *  has no outbound messaging to leads. */
function SendMessageMenu({ lead, t }: { lead: Lead; t: T }) {
  const phone = lead.contactPhone;
  const email = lead.contactEmail;
  if (!phone && !email) {
    return (
      <Button type="button" disabled className="ms-auto gap-1.5" title={t("noContactDetails")}>
        <Send className="h-4 w-4" />{t("sendMessage")}
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" className="ms-auto gap-1.5">
          <Send className="h-4 w-4 rtl:-scale-x-100" />{t("sendMessage")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {phone && (
          <DropdownMenuItem asChild>
            <a href={whatsappHref(phone)} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" />{t("methodWhatsapp")}</a>
          </DropdownMenuItem>
        )}
        {email && (
          <DropdownMenuItem asChild>
            <a href={`mailto:${email}`}><Mail className="h-4 w-4" />{t("methodEmail")}</a>
          </DropdownMenuItem>
        )}
        {phone && (
          <DropdownMenuItem asChild>
            <a href={`tel:${phone}`}><Phone className="h-4 w-4" />{t("methodCall")}</a>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
