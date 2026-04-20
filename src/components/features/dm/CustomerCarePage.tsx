"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Headset,
  Loader2,
  MessageSquare,
  Plus,
  ChevronLeft,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DirectMessageChat } from "@/components/features/dm/DirectMessageChat";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { Conversation } from "@/hooks/useConversations";

const CATEGORIES = [
  { value: "account", label: "Account & Profile", labelAr: "الحساب والملف الشخصي" },
  { value: "job_search", label: "Job Search & Applications", labelAr: "البحث عن وظيفة والطلبات" },
  { value: "technical", label: "Technical Issue", labelAr: "مشكلة تقنية" },
  { value: "billing", label: "Billing & Payments", labelAr: "الفواتير والمدفوعات" },
  { value: "other", label: "Other", labelAr: "أخرى" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  open: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  assigned: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  closed: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400",
};

export default function JobSeekerSupportPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeConvId, setActiveConvId] = useState<string | null>(
    searchParams.get("conv")
  );
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [category, setCategory] = useState("other");
  const [message, setMessage] = useState("");

  const currentUserId =
    (session?.user as unknown as { id?: string })?.id ?? "";

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/dm/customer-care");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Poll for updates
  useEffect(() => {
    const interval = setInterval(fetchConversations, 8000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  useEffect(() => {
    const conv = searchParams.get("conv");
    if (conv) setActiveConvId(conv);
  }, [searchParams]);

  function selectConversation(id: string) {
    setActiveConvId(id);
    router.replace(`/${locale}/job-seeker/messages?conv=${id}`, {
      scroll: false,
    });
  }

  function clearConversation() {
    setActiveConvId(null);
    router.replace(`/${locale}/job-seeker/messages`, { scroll: false });
  }

  async function createTicket() {
    if (!message.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/dm/customer-care", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, message: message.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewTicketOpen(false);
        setMessage("");
        setCategory("other");
        await fetchConversations();
        selectConversation(data.conversation._id);
      }
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  const activeConversation = conversations.find(
    (c) => c._id === activeConvId
  );

  return (
    <div className="page-container">
      <PageHeader
        title="Support"
        description="Get help from our support team"
        actions={
          <Dialog open={newTicketOpen} onOpenChange={setNewTicketOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                New Ticket
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Headset className="h-5 w-5" />
                  Contact Support
                </DialogTitle>
                <DialogDescription>
                  Describe your issue and our team will get back to you as soon as possible.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {locale === "ar" ? cat.labelAr : cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Message</Label>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe your issue…"
                    rows={4}
                    maxLength={2000}
                  />
                  <p className="text-[10px] text-muted-foreground text-right">
                    {message.length}/2000
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={createTicket}
                  disabled={!message.trim() || creating}
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Headset className="h-4 w-4 mr-2" />
                  )}
                  Submit Ticket
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex gap-0 rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm min-h-[600px]">
        {/* Ticket list */}
        <div
          className={cn(
            "w-full md:w-80 shrink-0 border-r flex flex-col",
            activeConvId ? "hidden md:flex" : "flex"
          )}
        >
          <div className="px-3 py-2.5 border-b">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Headset className="h-3.5 w-3.5" />
              Your Support Tickets
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center px-4">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <Headset className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <div>
                  <p className="text-sm font-medium">No support tickets</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Need help? Click &quot;New Ticket&quot; above to contact our support team.
                  </p>
                </div>
              </div>
            ) : (
              conversations.map((conv) => {
                const unread = conv.unreadCounts?.[currentUserId] ?? 0;
                const isActive = conv._id === activeConvId;
                const customerCare = (conv as unknown as Record<string, unknown>)
                  .customerCare as
                  | { status?: string; category?: string }
                  | undefined;
                const statusLabel = customerCare?.status ?? "open";
                const categoryLabel =
                  CATEGORIES.find((c) => c.value === customerCare?.category)
                    ?.label ?? "Other";

                return (
                  <button
                    key={conv._id}
                    onClick={() => selectConversation(conv._id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-border/40",
                      isActive
                        ? "bg-primary/5 border-l-2 border-l-primary"
                        : "hover:bg-muted/40"
                    )}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Headset className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-sm font-medium truncate">
                          {categoryLabel}
                        </p>
                        {unread > 0 && (
                          <span className="shrink-0 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                            {unread > 9 ? "9+" : unread}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span
                          className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded-full font-medium",
                            STATUS_COLORS[statusLabel] ?? STATUS_COLORS.open
                          )}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {conv.lastMessage ?? "No messages yet"}
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
            !activeConvId ? "hidden md:flex" : "flex"
          )}
        >
          {activeConversation && currentUserId ? (
            <>
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
                <Headset className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <div>
                <p className="font-medium text-foreground">
                  MployedIn Support
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Select a ticket or create a new one to get help from our team.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
