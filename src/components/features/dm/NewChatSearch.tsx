"use client";

import { useState, useRef, useCallback, type ReactNode } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Search, Loader2, MessageSquare, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useUserSearch, type SearchUser } from "@/hooks/useUserSearch";
import { cn } from "@/lib/utils";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split text into segments with matched portions wrapped in <strong> */
function highlightMatch(text: string, query: string): ReactNode[] {
  if (!query || !text) return [text];
  const escaped = escapeRegex(query);
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <strong key={i} className="text-primary font-semibold">
        {part}
      </strong>
    ) : (
      part
    )
  );
}

interface NewChatSearchProps {
  /** Which dashboard context (for routing after conversation creation) */
  dashboardPrefix: "employer" | "job-seeker" | "admin" | "super-agent" | "agent";
  /** Optional trigger button — defaults to built-in "New Chat" button */
  trigger?: ReactNode;
}

export function NewChatSearch({ dashboardPrefix, trigger }: NewChatSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const { data: session } = useSession();

  const { data: users = [], isLoading, isFetching } = useUserSearch(query);

  const currentUserId = (session?.user as unknown as { id?: string })?.id;

  const startConversation = useCallback(
    async (targetUser: SearchUser) => {
      if (!currentUserId || creating) return;
      setCreating(targetUser._id);
      try {
        const res = await fetch("/api/dm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId: targetUser._id }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? "Failed to start conversation");
        }
        const data = await res.json();
        const convId = data.conversation._id;
        setOpen(false);
        setQuery("");
        router.push(`/${locale}/${dashboardPrefix}/messages?conv=${convId}`);
      } catch (err) {
        console.error("[NewChatSearch] Failed:", err);
      } finally {
        setCreating(null);
      }
    },
    [currentUserId, creating, locale, dashboardPrefix, router]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIndex((prev) => Math.min(prev + 1, users.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && focusIndex >= 0 && users[focusIndex]) {
      e.preventDefault();
      startConversation(users[focusIndex]);
    }
  }

  // Reset state when dialog opens/closes
  function onOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen) {
      setQuery("");
      setFocusIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  const roleBadgeColor = (role: string) =>
    role === "employer"
      ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
      : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";

  const roleLabel = (role: string) =>
    role === "employer" ? "Employer" : "Job Seeker";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
            <MessageSquare className="h-3.5 w-3.5" />
            New Chat
          </button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Start a Conversation
          </DialogTitle>
          <DialogDescription className="sr-only">Search for users by name, headline, or company to start a direct message conversation.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setFocusIndex(-1);
              }}
              placeholder="Search by name, headline, or company…"
              className="pl-9"
              autoFocus
            />
            {isFetching && (
              <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[300px] overflow-y-auto rounded-lg border border-border/50">
            {query.length < 2 ? (
              /* Initial state */
              <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
                <Search className="h-6 w-6 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  Search by name to start a conversation
                </p>
              </div>
            ) : isLoading ? (
              /* Loading skeletons */
              <div className="divide-y divide-border/40">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-3 animate-pulse">
                    <div className="w-9 h-9 rounded-full bg-muted" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 bg-muted rounded w-32" />
                      <div className="h-2.5 bg-muted rounded w-48" />
                    </div>
                  </div>
                ))}
              </div>
            ) : users.length === 0 ? (
              /* No results */
              <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
                <Users className="h-6 w-6 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  No users found for &ldquo;{query}&rdquo;
                </p>
              </div>
            ) : (
              /* Results list */
              <div className="divide-y divide-border/40">
                {users.map((user, idx) => {
                  const subtitle =
                    user.role === "employer"
                      ? user.companyName
                      : user.headline;
                  const isFocused = idx === focusIndex;
                  const isCreatingThis = creating === user._id;

                  return (
                    <button
                      key={user._id}
                      onClick={() => startConversation(user)}
                      disabled={!!creating}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-3 text-left transition-colors",
                        isFocused
                          ? "bg-primary/5"
                          : "hover:bg-muted/40",
                        creating && !isCreatingThis && "opacity-50"
                      )}
                    >
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                        {user.avatar || user.companyLogo ? (
                          <img
                            src={user.avatar ?? user.companyLogo}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-sm font-bold text-primary">
                            {user.name?.[0]?.toUpperCase() ?? "?"}
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">
                            {highlightMatch(user.name, query)}
                          </p>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-1.5 py-0 h-4 shrink-0",
                              roleBadgeColor(user.role)
                            )}
                          >
                            {roleLabel(user.role)}
                          </Badge>
                        </div>
                        {subtitle && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {highlightMatch(subtitle, query)}
                          </p>
                        )}
                      </div>

                      {/* Loading indicator */}
                      {isCreatingThis && (
                        <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
