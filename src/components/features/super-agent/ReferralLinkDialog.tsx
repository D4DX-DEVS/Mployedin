"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-time-picker";
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
import { formatDate } from "@/lib/ui/intlFormat";

interface ReferralLinkDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ReferralLinkDialog({ open, onClose }: ReferralLinkDialogProps) {
  const t = useTranslations("referralLinkDialog");
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
      // 404 = no link yet; POST creates it (GET is read-only)
      .then((r) =>
        r.ok
          ? r.json()
          : r.status === 404
            ? fetch("/api/referral", { method: "POST" }).then((p) => (p.ok ? p.json() : null))
            : null
      )
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
      <DialogContent className="max-w-lg gap-0 overflow-hidden rounded-3xl p-0">
        {/* Header */}
        <DialogHeader className="border-b border-border/60 bg-gradient-to-br from-sky-50/80 to-indigo-50/60 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-600/10 text-sky-600">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold tracking-tight">
                {t("referralLinks")}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
                {t("shareReferralLinksDesc")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {/* ── Verified badge info ──────────────────────────── */}
          <div className="mx-6 mt-5 flex items-start gap-3 rounded-2xl border border-green-200/60 bg-green-50/60 p-3.5">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
            <div>
              <p className="text-xs font-semibold text-green-800">{t("verifiedBadgeOnSignup")}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-green-700/80">
                {t("verifiedBadgeDesc")}
              </p>
            </div>
          </div>

          {/* ── Quick referral link (legacy) ─────────────────── */}
          <div className="mx-6 mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t("yourReferralLink")}
            </p>
            {legacyLoading ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("generatingLink")}
              </div>
            ) : legacyLink ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-border/60 bg-secondary/40 chip-pad">
                <code className="flex-1 truncate text-xs text-foreground">{legacyLink}</code>
                <button
                  onClick={() => handleCopy(legacyLink, "legacy")}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-sky-600 px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-sky-700"
                >
                  {copiedId === "legacy" ? (
                    <><Check className="h-3 w-3" /> {t("copied")}</>
                  ) : (
                    <><Copy className="h-3 w-3" /> {t("copy")}</>
                  )}
                </button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">{t("failedToLoad")}</p>
            )}
            {legacyCode && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Referral code: <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground">{legacyCode}</code>
              </p>
            )}
          </div>

          {/* ── Stats ─────────────────────────────────────────── */}
          <div className="mx-6 mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border/50 bg-secondary/30 text-center chip-pad">
              <p className="text-lg font-semibold text-foreground">{advancedLinks.length}</p>
              <p className="text-[10px] text-muted-foreground">{t("activeLinks")}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-secondary/30 text-center chip-pad">
              <p className="text-lg font-semibold text-foreground">{totalRegistrations}</p>
              <p className="text-[10px] text-muted-foreground">{t("registrations")}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-secondary/30 text-center chip-pad">
              <p className="text-lg font-semibold text-emerald-600">
                {totalRegistrations > 0 ? "100%" : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">{t("verifiedRate")}</p>
            </div>
          </div>

          {/* ── Advanced referral links list ──────────────────── */}
          <div className="mx-6 mt-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t("trackedLinks")}
              </p>
              <button
                onClick={() => setShowCreate(!showCreate)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-600 hover:text-sky-700"
              >
                <Plus className="h-3 w-3" />
                {t("newLink")}
              </button>
            </div>

            {/* Create new link form */}
            {showCreate && (
              <div className="mt-3 space-y-2.5 rounded-xl border border-sky-200/60 bg-sky-50/40 p-3.5">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">
                    <Tag className="mr-1 inline h-3 w-3" />{t("labelOptional")}
                  </label>
                  <Input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder={t("exampleLinkedinCampaign")}
                    className="mt-1 h-8 rounded-lg text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">
                      <Hash className="mr-1 inline h-3 w-3" />{t("maxUses")}
                    </label>
                    <Input
                      type="number"
                      value={newMaxUses}
                      onChange={(e) => setNewMaxUses(e.target.value)}
                      placeholder={t("unlimitedPlaceholder")}
                      className="mt-1 h-8 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">
                      <CalendarClock className="mr-1 inline h-3 w-3" />{t("expires")}
                    </label>
                    <DateTimePicker
                      mode="date"
                      value={newExpiry}
                      onChange={setNewExpiry}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setShowCreate(false)}
                    className="h-7 rounded-lg px-3 text-[11px] font-medium text-muted-foreground hover:bg-secondary"
                  >
                    {t("cancel")}
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
                    {t("createLink")}
                  </button>
                </div>
              </div>
            )}

            {/* Links list */}
            {linksLoading ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("loadingLinks")}
              </div>
            ) : advancedLinks.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {t("noTrackedLinks")}
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
                      className="flex items-center gap-3 rounded-xl border border-border/50 bg-secondary/20 transition-colors hover:bg-secondary/40 chip-pad"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-semibold text-foreground">{link.code}</code>
                          {link.label && (
                            <span className="truncate rounded-full bg-sky-100/60 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                              {link.label}
                            </span>
                          )}
                          {!link.isActive && (
                            <span className="rounded-full bg-red-100/60 px-2 py-0.5 text-[10px] font-medium text-red-600">
                              {t("disabled")}
                            </span>
                          )}
                          {isExpired && (
                            <span className="rounded-full bg-amber-100/60 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                              {t("expired")}
                            </span>
                          )}
                          {isMaxed && (
                            <span className="rounded-full bg-amber-100/60 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                              {t("maxReached")}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {link.usedCount} {link.usedCount !== 1 ? t("signups") : t("signup")}
                          </span>
                          {link.maxUses > 0 && <span>{t("max")}: {link.maxUses}</span>}
                          {link.expiresAt && (
                            <span>{t("exp")}: {formatDate(new Date(link.expiresAt))}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleCopy(referralUrl, link._id)}
                        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-border/50 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary"
                      >
                        {copiedId === link._id ? (
                          <><Check className="h-3 w-3 text-green-600" /> {t("copied")}</>
                        ) : (
                          <><Copy className="h-3 w-3" /> {t("copy")}</>
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
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-700"
            >
              <ExternalLink className="h-3 w-3" />
              {t("manageAllReferralLinks")}
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
