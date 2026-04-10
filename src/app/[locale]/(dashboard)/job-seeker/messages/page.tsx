"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { MessageSquare, Search, Inbox, Loader2, ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DirectMessageChat } from "@/components/features/dm/DirectMessageChat";
import { NewChatSearch } from "@/components/features/dm/NewChatSearch";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useConversations } from "@/hooks/useConversations";

export default function JobSeekerMessagesPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const { data: conversations = [], isLoading: loading } = useConversations();
  const [search, setSearch] = useState("");
  const [activeConvId, setActiveConvId] = useState<string | null>(
    searchParams.get("conv")
  );

  const currentUserId = (session?.user as unknown as { id?: string })?.id ?? "";

  useEffect(() => {
    const conv = searchParams.get("conv");
    if (conv) setActiveConvId(conv);
  }, [searchParams]);

  function selectConversation(id: string) {
    setActiveConvId(id);
    router.replace(`/${locale}/job-seeker/messages?conv=${id}`, { scroll: false });
  }

  function clearConversation() {
    setActiveConvId(null);
    router.replace(`/${locale}/job-seeker/messages`, { scroll: false });
  }

  // Enhanced search: name + headline + companyName
  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const other = c.participantDetails.find((p) => p.userId !== currentUserId);
    if (!other) return false;
    return (
      other.name.toLowerCase().includes(q) ||
      (other.headline?.toLowerCase().includes(q) ?? false) ||
      (other.companyName?.toLowerCase().includes(q) ?? false)
    );
  });

  const activeConversation = conversations.find((c) => c._id === activeConvId);

  return (
    <div className="page-container">
      <PageHeader
        title="Messages"
        description="Messages with employers and recruiters"
        actions={<NewChatSearch dashboardPrefix="job-seeker" />}
      />

      <div className="flex gap-0 rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm min-h-[600px]">
        {/* Conversation list — responsive sidebar */}
        <div
          className={cn(
            "w-full md:w-80 shrink-0 border-r flex flex-col",
            activeConvId ? "hidden md:flex" : "flex"
          )}
        >
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations…"
                className="pl-8 h-10 sm:h-8 text-xs"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center px-4">
                <Inbox className="h-6 w-6 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">
                  {search
                    ? "No conversations match your search."
                    : "No messages yet. Start a conversation with the \"New Chat\" button above."}
                </p>
              </div>
            ) : (
              filtered.map((conv) => {
                const other = conv.participantDetails.find((p) => p.userId !== currentUserId);
                const unread = conv.unreadCounts?.[currentUserId] ?? 0;
                const isActive = conv._id === activeConvId;
                const subtitle = other?.companyName ?? other?.headline;

                return (
                  <button
                    key={conv._id}
                    onClick={() => selectConversation(conv._id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-border/40",
                      isActive ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/40"
                    )}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">
                        {other?.name?.[0]?.toUpperCase() ?? "?"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-sm font-medium truncate">{other?.name ?? "Unknown"}</p>
                        {unread > 0 && (
                          <span className="shrink-0 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                            {unread > 9 ? "9+" : unread}
                          </span>
                        )}
                      </div>
                      {subtitle && (
                        <p className="text-[11px] text-muted-foreground/60 truncate">{subtitle}</p>
                      )}
                      <p className="text-xs text-muted-foreground truncate">
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
        <div className={cn("flex-1 flex flex-col", !activeConvId ? "hidden md:flex" : "flex")}>
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
              <DirectMessageChat
                key={activeConversation._id}
                conversation={activeConversation}
                currentUserId={currentUserId}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <div>
                <p className="font-medium text-foreground">Select a conversation</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose a conversation from the left, or start a new chat.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
