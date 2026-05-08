"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Search, Inbox, Loader2, ChevronLeft, Headset, Shield, Users, Building2, Star, Plus, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DirectMessageChat } from "@/components/features/dm/DirectMessageChat";
import { NewChatSearch } from "@/components/features/dm/NewChatSearch";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useConversations, conversationKeys } from "@/hooks/useConversations";
import type { Conversation } from "@/hooks/useConversations";

const ROLE_ICONS: Record<string, React.ReactNode> = {
  admin: <Shield className="h-3 w-3" />,
  super_agent: <Star className="h-3 w-3" />,
  agent: <Users className="h-3 w-3" />,
  employer: <Building2 className="h-3 w-3" />,
  job_seeker: <Headset className="h-3 w-3" />,
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  super_agent: "Super Agent",
  agent: "Agent",
  employer: "Employer",
  job_seeker: "Job Seeker",
};

interface UnifiedMessagesPageProps {
  /** The current role's dashboard prefix for routing */
  dashboardPrefix: string;
  /** Page title */
  title?: string;
  /** Page description */
  description?: string;
  /** Whether to show the "New Chat" button */
  showNewChat?: boolean;
  /** Whether to show customer care tab (admin only) */
  showCustomerCare?: boolean;
  /** Support-only mode: hides DM tab, defaults to support */
  supportOnly?: boolean;
  /** Label for the "New Chat" button */
  newChatLabel?: string;
  /** Placeholder for the search input */
  searchPlaceholder?: string;
  /** Text shown when no DM conversations exist */
  emptyStateText?: string;
  /** Title shown when no conversation is selected */
  selectConversationTitle?: string;
  /** Description shown when no conversation is selected */
  selectConversationHint?: string;
}

export function UnifiedMessagesPage({
  dashboardPrefix,
  title = "Messages",
  description = "Direct messages & conversations",
  showNewChat = true,
  showCustomerCare = false,
  supportOnly = false,
  newChatLabel,
  searchPlaceholder,
  emptyStateText,
  selectConversationTitle,
  selectConversationHint,
}: UnifiedMessagesPageProps) {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const isRtl = locale === "ar";
  const queryClient = useQueryClient();

  const { data: conversations = [], isLoading: loading } = useConversations({ enabled: !supportOnly });
  const { data: customerCareConvs = [], isLoading: customerCareLoading } = useQuery({
    queryKey: ["customerCareConversations"],
    queryFn: async () => {
      const res = await fetch("/api/dm/customer-care?limit=50");
      if (!res.ok) throw new Error("Failed to fetch customer care conversations");
      const data = await res.json();
      return (data.conversations ?? []) as Conversation[];
    },
    enabled: showCustomerCare || supportOnly,
    staleTime: 15 * 1000,
    refetchInterval: (showCustomerCare || supportOnly) ? 15_000 : false,
  });
  const [search, setSearch] = useState("");
  const [activeConvId, setActiveConvId] = useState<string | null>(
    searchParams.get("conv")
  );
  const [activeTab, setActiveTab] = useState<"dm" | "support">(
    supportOnly ? "support" : searchParams.get("tab") === "support" ? "support" : "dm"
  );
  // Pending new-chat recipient (conversation not created yet)
  const [pendingRecipientId, setPendingRecipientId] = useState<string | null>(
    searchParams.get("newChat")
  );

  // New support ticket dialog state
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [ticketCategory, setTicketCategory] = useState("account");
  const [ticketMessage, setTicketMessage] = useState("");
  const [ticketSubmitting, setTicketSubmitting] = useState(false);

  async function handleCreateTicket() {
    if (!ticketMessage.trim()) return;
    setTicketSubmitting(true);
    try {
      const res = await fetch("/api/dm/customer-care", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: ticketCategory, message: ticketMessage.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create ticket");
      const data = await res.json();
      const convId = data.conversation?._id;
      queryClient.invalidateQueries({ queryKey: ["customerCareConversations"] });
      setTicketDialogOpen(false);
      setTicketMessage("");
      setTicketCategory("account");
      if (convId) selectConversation(convId);
    } finally {
      setTicketSubmitting(false);
    }
  }

  const [reopening, setReopening] = useState(false);
  async function handleReopenTicket(conversationId: string) {
    setReopening(true);
    try {
      const res = await fetch(`/api/dm/customer-care/${conversationId}/manage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "open" }),
      });
      if (!res.ok) throw new Error("Failed to re-open ticket");
      queryClient.invalidateQueries({ queryKey: ["customerCareConversations"] });
    } finally {
      setReopening(false);
    }
  }

  const currentUserId = (session?.user as unknown as { id?: string })?.id ?? "";

  // Fetch pending recipient's user info from the search API
  const { data: pendingRecipientData } = useQuery({
    queryKey: ["pendingRecipient", pendingRecipientId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${pendingRecipientId}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.user as { _id: string; name: string; role: string; avatar?: string; headline?: string; companyName?: string } | null;
    },
    enabled: !!pendingRecipientId,
    staleTime: 60 * 1000,
  });

  // Build a synthetic conversation object for the pending new-chat view
  const pendingConversation: Conversation | undefined = pendingRecipientData
    ? {
        _id: `pending-${pendingRecipientData._id}`,
        participants: [currentUserId, pendingRecipientData._id],
        participantDetails: [
          { userId: currentUserId, name: "Me", role: "" },
          {
            userId: pendingRecipientData._id,
            name: pendingRecipientData.name,
            role: pendingRecipientData.role,
            avatar: pendingRecipientData.avatar,
            headline: pendingRecipientData.headline,
            companyName: pendingRecipientData.companyName,
          },
        ],
      }
    : undefined;

  // Sync active conv with URL param
  useEffect(() => {
    const conv = searchParams.get("conv");
    const newChat = searchParams.get("newChat");
    if (conv) {
      setActiveConvId(conv);
      setPendingRecipientId(null);
    } else if (newChat) {
      setPendingRecipientId(newChat);
      setActiveConvId(null);
    }
  }, [searchParams]);

  function selectConversation(id: string) {
    setActiveConvId(id);
    setPendingRecipientId(null);
    const tabParam = activeTab === "support" ? "&tab=support" : "";
    router.replace(`/${locale}/${dashboardPrefix}/messages?conv=${id}${tabParam}`, {
      scroll: false,
    });
  }

  function clearConversation() {
    setActiveConvId(null);
    setPendingRecipientId(null);
    const tabParam = activeTab === "support" ? "?tab=support" : "";
    router.replace(`/${locale}/${dashboardPrefix}/messages${tabParam}`, {
      scroll: false,
    });
  }

  // Called when DirectMessageChat creates a real conversation from a pending chat
  const handleConversationCreated = useCallback((convId: string) => {
    setPendingRecipientId(null);
    setActiveConvId(convId);
    queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
    router.replace(`/${locale}/${dashboardPrefix}/messages?conv=${convId}`, { scroll: false });
  }, [queryClient, locale, dashboardPrefix, router]);

  // Enhanced search: name + headline + companyName
  function filterConversations(convs: Conversation[]) {
    if (!search) return convs;
    const q = search.toLowerCase();
    return convs.filter((c) => {
      const other = c.participantDetails.find((p) => p.userId !== currentUserId);
      if (!other) return false;
      return (
        other.name.toLowerCase().includes(q) ||
        (other.headline?.toLowerCase().includes(q) ?? false) ||
        (other.companyName?.toLowerCase().includes(q) ?? false) ||
        (other.role?.toLowerCase().includes(q) ?? false)
      );
    });
  }

  const displayConversations = (activeTab === "support" || supportOnly) ? customerCareConvs : conversations;
  const filtered = filterConversations(displayConversations);
  const isLoadingConvs = (activeTab === "support" || supportOnly) ? customerCareLoading : loading;

  // Find active conversation across both lists
  const activeConversation = pendingConversation
    ?? conversations.find((c) => c._id === activeConvId)
    ?? customerCareConvs.find((c) => c._id === activeConvId);

  const dmUnreadTotal = conversations.reduce(
    (sum, c) => sum + (c.unreadCounts?.[currentUserId] ?? 0),
    0
  );
  const ccUnreadTotal = customerCareConvs.reduce(
    (sum, c) => sum + (c.unreadCounts?.[currentUserId] ?? 0),
    0
  );

  return (
    <div className="page-container">
      <PageHeader
        title={title}
        description={description}
        actions={
          supportOnly ? (
            <Dialog open={ticketDialogOpen} onOpenChange={setTicketDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  New Ticket
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>New Support Ticket</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4 pt-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Category</label>
                    <Select value={ticketCategory} onValueChange={setTicketCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="account">Account</SelectItem>
                        <SelectItem value="job_search">Job Search</SelectItem>
                        <SelectItem value="technical">Technical</SelectItem>
                        <SelectItem value="billing">Billing</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Message</label>
                    <Textarea
                      value={ticketMessage}
                      onChange={(e) => setTicketMessage(e.target.value)}
                      placeholder="Describe your issue…"
                      rows={4}
                    />
                  </div>
                  <Button
                    onClick={handleCreateTicket}
                    disabled={!ticketMessage.trim() || ticketSubmitting}
                  >
                    {ticketSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Submit Ticket
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : showNewChat && activeTab === "dm" ? (
            <NewChatSearch dashboardPrefix={dashboardPrefix as "employer" | "job-seeker"} newChatLabel={newChatLabel} />
          ) : undefined
        }
      />

      <div className="flex gap-0 rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm min-h-[600px]">
        {/* Conversation list — responsive sidebar */}
        <div
          className={cn(
            "w-full md:w-80 shrink-0 flex flex-col",
            isRtl ? "border-l" : "border-r",
            (activeConvId || pendingRecipientId) ? "hidden md:flex" : "flex"
          )}
        >
          {/* Tab switcher - hidden in supportOnly mode */}
          {showCustomerCare && !supportOnly && (
            <div className="flex border-b">
              <button
                onClick={() => { setActiveTab("dm"); setActiveConvId(null); }}
                className={cn(
                  "flex-1 px-3 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1.5",
                  activeTab === "dm"
                    ? "text-primary border-b-2 border-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Messages
                {dmUnreadTotal > 0 && (
                  <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                    {dmUnreadTotal > 99 ? "99+" : dmUnreadTotal}
                  </Badge>
                )}
              </button>
              <button
                onClick={() => { setActiveTab("support"); setActiveConvId(null); }}
                className={cn(
                  "flex-1 px-3 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1.5",
                  activeTab === "support"
                    ? "text-primary border-b-2 border-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Headset className="h-3.5 w-3.5" />
                Support
                {ccUnreadTotal > 0 && (
                  <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                    {ccUnreadTotal > 99 ? "99+" : ccUnreadTotal}
                  </Badge>
                )}
              </button>
            </div>
          )}

          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder ?? "Search conversations…"}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoadingConvs ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center px-4">
                <Inbox className="h-6 w-6 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">
                  {search
                    ? "No conversations match your search."
                    : (activeTab === "support" || supportOnly)
                    ? 'No support tickets yet. Click "New Ticket" to contact support.'
                    : (emptyStateText ?? 'No conversations yet. Start one with the "New Chat" button above.')}
                </p>
              </div>
            ) : (
              filtered.map((conv) => {
                const other = conv.participantDetails.find(
                  (p) => p.userId !== currentUserId
                );
                const unread = conv.unreadCounts?.[currentUserId] ?? 0;
                const isActive = conv._id === activeConvId;
                const subtitle = other?.headline ?? other?.companyName;
                const customerCare = conv.customerCare;

                return (
                  <button
                    key={conv._id}
                    onClick={() => selectConversation(conv._id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 transition-colors border-b border-border/40",
                      isRtl ? "text-right" : "text-left",
                      isActive
                        ? cn("bg-primary/5", isRtl ? "border-r-2 border-r-primary" : "border-l-2 border-l-primary")
                        : "hover:bg-muted/40"
                    )}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                      {other?.avatar ? (
                        <img
                          src={other.avatar}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-sm font-bold text-primary">
                          {other?.name?.[0]?.toUpperCase() ?? "?"}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {other?.name ?? "Unknown"}
                          </p>
                          {other?.role && (
                            <span className="shrink-0 text-muted-foreground/60">
                              {ROLE_ICONS[other.role]}
                            </span>
                          )}
                        </div>
                        {unread > 0 && (
                          <span className="shrink-0 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                            {unread > 9 ? "9+" : unread}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {other?.role && (
                          <span className="text-[10px] text-muted-foreground/60 capitalize">
                            {ROLE_LABELS[other.role] ?? other.role.replace("_", " ")}
                          </span>
                        )}
                        {subtitle && (
                          <>
                            <span className="text-[10px] text-muted-foreground/30">·</span>
                            <span className="text-[10px] text-muted-foreground/60 truncate">
                              {subtitle}
                            </span>
                          </>
                        )}
                      </div>
                      {/* Customer care status badges */}
                      {customerCare && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Badge
                            variant={
                              customerCare.status === "open"
                                ? "destructive"
                                : customerCare.status === "assigned"
                                ? "default"
                                : "secondary"
                            }
                            className="h-4 px-1 text-[9px]"
                          >
                            {customerCare.status}
                          </Badge>
                          {customerCare.priority === "urgent" && (
                            <Badge variant="destructive" className="h-4 px-1 text-[9px]">
                              urgent
                            </Badge>
                          )}
                          {customerCare.category && (
                            <Badge variant="outline" className="h-4 px-1 text-[9px]">
                              {customerCare.category}
                            </Badge>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {conv.lastMessage ?? "Start a conversation"}
                      </p>
                      {conv.lastMessageAt && (
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                          {new Date(conv.lastMessageAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Chat window */}
        <div
          className={cn(
            "flex-1 flex flex-col",
            !activeConvId && !pendingRecipientId ? "hidden md:flex" : "flex"
          )}
        >
          {activeConversation && currentUserId ? (
            <>
              {/* Mobile back button */}
              <button
                onClick={clearConversation}
                className="md:hidden flex items-center gap-2 px-4 py-3 border-b border-border/40 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
              {/* Re-open banner for resolved/closed tickets */}
              {supportOnly &&
                activeConversation.customerCare &&
                ["resolved", "closed"].includes(activeConversation.customerCare.status) && (
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/60 border-b border-border/40">
                    <p className="text-sm text-muted-foreground">
                      This ticket has been{" "}
                      <span className="font-medium">{activeConversation.customerCare.status}</span>.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReopenTicket(activeConversation._id)}
                      disabled={reopening}
                      className="gap-1.5"
                    >
                      {reopening ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Re-open
                    </Button>
                  </div>
                )}
              <DirectMessageChat
                key={activeConversation._id}
                conversation={activeConversation}
                currentUserId={currentUserId}
                onDeleteConversation={clearConversation}
                onConversationCreated={handleConversationCreated}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <div>
                <p className="font-medium text-foreground">{selectConversationTitle ?? "Select a conversation"}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {activeTab === "support"
                    ? "Select a support ticket from the left to respond."
                    : (selectConversationHint ?? "Choose a conversation from the left, or start a new chat.")}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
