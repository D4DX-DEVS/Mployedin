"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Check,
  Copy,
  Link2,
  Loader2,
  Plus,
  ShieldCheck,
  Users,
  ExternalLink,
  CalendarClock,
  Hash,
  Tag,
} from "lucide-react";
import { useCreateReferralLink, useReferralLinks, ReferralLinkItem } from "@/hooks/useReferralLinks";

interface ReferralLinkDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ReferralLinkDialog({ open, onClose }: ReferralLinkDialogProps) {
  const { locale } = useParams<{ locale: string }>();
  /* ── Legacy referral code (quick link) ────────────────────── */
  const [legacyLink, setLegacyLink] = useState("");
  const [legacyCode, setLegacyCode] = useState("");
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /* ── Advanced referral links ──────────────────────────────── */
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newExpiry, setNewExpiry] = useState("");

  const { data: linksData, isLoading: linksLoading } = useReferralLinks({
    page: 1,
    limit: 5,
  });
  const createMutation = useCreateReferralLink();

  /* Fetch legacy referral code when dialog opens */
  useEffect(() => {
    if (!open) return;
    setLegacyLoading(true);
    fetch("/api/referral")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setLegacyLink(data.referralLink);
          setLegacyCode(data.referralCode);
        }
      })
      .catch(() => {})
      .finally(() => setLegacyLoading(false));
  }, [open]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      label: newLabel || undefined,
      maxUses: newMaxUses ? parseInt(newMaxUses) : undefined,
      expiresAt: newExpiry || undefined,
    });
    setShowCreate(false);
    setNewLabel("");
    setNewMaxUses("");
    setNewExpiry("");
  };

  const advancedLinks = linksData?.links ?? [];
  const totalRegistrations = advancedLinks.reduce((sum, l) => sum + l.usedCount, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden rounded-[24px] p-0">
        {/* Header */}
        <DialogHeader className="border-b border-border/60 bg-gradient-to-br from-sky-50/80 to-indigo-50/60 px-6 py-5 dark:from-sky-950/30 dark:to-indigo-950/20">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-600/10 text-sky-600 dark:bg-sky-400/10 dark:text-sky-400">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold tracking-tight">
                Referral Links
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
                Share referral links so employers can sign up directly. They get auto-verified and linked to your account.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {/* ── Verified badge info ──────────────────────────── */}
          <div className="mx-6 mt-5 flex items-start gap-3 rounded-2xl border border-green-200/60 bg-green-50/60 p-3.5 dark:border-green-800/40 dark:bg-green-950/20">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
            <div>
              <p className="text-xs font-semibold text-green-800 dark:text-green-300">Verified Badge on Signup</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-green-700/80 dark:text-green-400/70">
                Employers who register through your referral link automatically receive a <strong>verified badge</strong>, get linked to your account, and appear in your employer portfolio.
              </p>
            </div>
          </div>

          {/* ── Quick referral link (legacy) ─────────────────── */}
          <div className="mx-6 mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Your Referral Link
            </p>
            {legacyLoading ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating link…
              </div>
            ) : legacyLink ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2.5">
                <code className="flex-1 truncate text-xs text-foreground">{legacyLink}</code>
                <button
                  onClick={() => handleCopy(legacyLink, "legacy")}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-sky-600 px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-sky-700"
                >
                  {copiedId === "legacy" ? (
                    <><Check className="h-3 w-3" /> Copied</>
                  ) : (
                    <><Copy className="h-3 w-3" /> Copy</>
                  )}
                </button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Failed to load. Try again.</p>
            )}
            {legacyCode && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Referral code: <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground">{legacyCode}</code>
              </p>
            )}
          </div>

          {/* ── Stats ─────────────────────────────────────────── */}
          <div className="mx-6 mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border/50 bg-secondary/30 p-3 text-center">
              <p className="text-lg font-semibold text-foreground">{advancedLinks.length}</p>
              <p className="text-[10px] text-muted-foreground">Active Links</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-secondary/30 p-3 text-center">
              <p className="text-lg font-semibold text-foreground">{totalRegistrations}</p>
              <p className="text-[10px] text-muted-foreground">Registrations</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-secondary/30 p-3 text-center">
              <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                {totalRegistrations > 0 ? "100%" : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">Verified Rate</p>
            </div>
          </div>

          {/* ── Advanced referral links list ──────────────────── */}
          <div className="mx-6 mt-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Tracked Links
              </p>
              <button
                onClick={() => setShowCreate(!showCreate)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400"
              >
                <Plus className="h-3 w-3" />
                New Link
              </button>
            </div>

            {/* Create new link form */}
            {showCreate && (
              <div className="mt-3 space-y-2.5 rounded-xl border border-sky-200/60 bg-sky-50/40 p-3.5 dark:border-sky-800/40 dark:bg-sky-950/20">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">
                    <Tag className="mr-1 inline h-3 w-3" />Label (optional)
                  </label>
                  <Input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="e.g. LinkedIn campaign"
                    className="mt-1 h-8 rounded-lg text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">
                      <Hash className="mr-1 inline h-3 w-3" />Max Uses
                    </label>
                    <Input
                      type="number"
                      value={newMaxUses}
                      onChange={(e) => setNewMaxUses(e.target.value)}
                      placeholder="0 = unlimited"
                      className="mt-1 h-8 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">
                      <CalendarClock className="mr-1 inline h-3 w-3" />Expires
                    </label>
                    <Input
                      type="date"
                      value={newExpiry}
                      onChange={(e) => setNewExpiry(e.target.value)}
                      className="mt-1 h-8 rounded-lg text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setShowCreate(false)}
                    className="h-7 rounded-lg px-3 text-[11px] font-medium text-muted-foreground hover:bg-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={createMutation.isPending}
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-[11px] font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    Create Link
                  </button>
                </div>
              </div>
            )}

            {/* Links list */}
            {linksLoading ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading links…
              </div>
            ) : advancedLinks.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                No tracked links yet. Create one to track signups from specific campaigns.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {advancedLinks.map((link: ReferralLinkItem) => {
                  const referralUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/${locale || "en"}/employer-register?ref=${link.code}`;
                  const isExpired = link.expiresAt && new Date(link.expiresAt) < new Date();
                  const isMaxed = link.maxUses > 0 && link.usedCount >= link.maxUses;

                  return (
                    <div
                      key={link._id}
                      className="flex items-center gap-3 rounded-xl border border-border/50 bg-secondary/20 p-3 transition-colors hover:bg-secondary/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-semibold text-foreground">{link.code}</code>
                          {link.label && (
                            <span className="truncate rounded-full bg-sky-100/60 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                              {link.label}
                            </span>
                          )}
                          {!link.isActive && (
                            <span className="rounded-full bg-red-100/60 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400">
                              Disabled
                            </span>
                          )}
                          {isExpired && (
                            <span className="rounded-full bg-amber-100/60 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                              Expired
                            </span>
                          )}
                          {isMaxed && (
                            <span className="rounded-full bg-amber-100/60 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                              Max reached
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {link.usedCount} signup{link.usedCount !== 1 ? "s" : ""}
                          </span>
                          {link.maxUses > 0 && <span>Max: {link.maxUses}</span>}
                          {link.expiresAt && (
                            <span>Exp: {new Date(link.expiresAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleCopy(referralUrl, link._id)}
                        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-border/50 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary"
                      >
                        {copiedId === link._id ? (
                          <><Check className="h-3 w-3 text-green-600" /> Copied</>
                        ) : (
                          <><Copy className="h-3 w-3" /> Copy</>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Manage link to full page ──────────────────────── */}
          <div className="mx-6 mb-6 mt-5">
            <a
              href="/en/super-agent/referral-links"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400"
            >
              <ExternalLink className="h-3 w-3" />
              Manage all referral links
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
