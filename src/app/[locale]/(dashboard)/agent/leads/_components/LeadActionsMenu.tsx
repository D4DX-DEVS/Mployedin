"use client";

import {
  Building2, CalendarPlus, CheckCircle2, ExternalLink, Flame, Loader2,
  MessageSquarePlus, MoreVertical, Pencil, Trash2, TrendingUp, XCircle,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { isOpenStage, type Lead, type LeadStatus, type T } from "./leadShared";

/** Everything a lead can be asked to do, owned by the page so the board, the
 *  table and the workspace all open the same dialogs. */
export interface LeadActionHandlers {
  open: (lead: Lead, tab?: "overview" | "activity" | "notes") => void;
  edit: (lead: Lead) => void;
  move: (lead: Lead, target?: LeadStatus, lockTarget?: boolean) => void;
  followUp: (lead: Lead) => void;
  addNote: (lead: Lead) => void;
  score: (lead: Lead) => void;
  createAccount: (lead: Lead) => void;
  remove: (lead: Lead) => void;
}

export interface LeadActionState {
  canUpdate: boolean;
  canDelete: boolean;
  scoringId: string | null;
  convertingId: string | null;
}

/**
 * The lead's ⋮ menu. The card used to carry three bare icons (flame, building,
 * arrow) that nobody could read; every secondary action now lives here, named.
 */
export function LeadActionsMenu({
  lead,
  actions,
  state,
  t,
  showOpen = false,
  className,
}: {
  lead: Lead;
  actions: LeadActionHandlers;
  state: LeadActionState;
  t: T;
  /** The board's card offers "Open lead"; the workspace is already open. */
  showOpen?: boolean;
  className?: string;
}) {
  const scoring = state.scoringId === lead._id;
  const converting = state.convertingId === lead._id;
  const open = isOpenStage(lead.status);
  const canCreateAccount = lead.status === "converted" && !lead.convertedToEmployerId;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("moreActionsFor", { company: lead.companyName })}
        className={cn(
          "inline-flex h-11 w-11 shrink-0 items-center sm:h-9 sm:w-9 justify-center rounded-lg border border-border/70 bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          className,
        )}
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{lead.companyName}</DropdownMenuLabel>
        {showOpen && (
          <DropdownMenuItem onSelect={() => actions.open(lead)}>
            <ExternalLink className="h-4 w-4" />{t("openLead")}
          </DropdownMenuItem>
        )}
        {state.canUpdate && (
          <>
            <DropdownMenuItem onSelect={() => actions.edit(lead)}>
              <Pencil className="h-4 w-4" />{t("editLead")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.move(lead)}>
              <TrendingUp className="h-4 w-4" />{t("moveStage")}
            </DropdownMenuItem>
            {open && (
              <DropdownMenuItem onSelect={() => actions.followUp(lead)}>
                <CalendarPlus className="h-4 w-4" />{lead.followUpAt ? t("rescheduleFollowUp") : t("addFollowUp")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => actions.addNote(lead)}>
              <MessageSquarePlus className="h-4 w-4" />{t("addNote")}
            </DropdownMenuItem>
            {/* At least one of Mark Won / Mark Lost always applies. */}
            <DropdownMenuSeparator />
            {lead.status !== "converted" && (
              <DropdownMenuItem onSelect={() => actions.move(lead, "converted", true)}>
                <CheckCircle2 className="h-4 w-4 text-status-selected" />{t("markWon")}
              </DropdownMenuItem>
            )}
            {lead.status !== "lost" && (
              <DropdownMenuItem onSelect={() => actions.move(lead, "lost", true)}>
                <XCircle className="h-4 w-4 text-status-rejected" />{t("markLost")}
              </DropdownMenuItem>
            )}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={scoring} onSelect={() => actions.score(lead)}>
          {scoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}{t("aiScore")}
        </DropdownMenuItem>
        {canCreateAccount && state.canUpdate && (
          <DropdownMenuItem disabled={converting} onSelect={() => actions.createAccount(lead)}>
            {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}{t("createEmployerAccount")}
          </DropdownMenuItem>
        )}
        {state.canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => actions.remove(lead)} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4" />{t("deleteLead")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
