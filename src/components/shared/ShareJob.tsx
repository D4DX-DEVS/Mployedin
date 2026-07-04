"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Share2, Link2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShareJobProps {
  jobId: string;
  jobTitle: string;
  companyName: string;
  locale: string;
  /** Render as icon-only button (for cards) vs full button */
  variant?: "icon" | "full";
}

const WHATSAPP_ICON = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const LINKEDIN_ICON = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const X_ICON = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

export function ShareJob({ jobId, jobTitle, companyName, locale, variant = "full" }: ShareJobProps) {
  const t = useTranslations("shareJob");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const jobUrl = `${baseUrl}/${locale}/job-seeker/jobs/${jobId}`;
  const shareText = `${jobTitle} at ${companyName} — Apply now on MPLOYEDIN`;

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jobUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = jobUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [jobUrl]);

  const shareWhatsApp = useCallback(() => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${jobUrl}`)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }, [shareText, jobUrl]);

  const shareLinkedIn = useCallback(() => {
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(jobUrl)}`,
      "_blank",
      "noopener,noreferrer,width=600,height=500",
    );
  }, [jobUrl]);

  const shareX = useCallback(() => {
    window.open(
      `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(jobUrl)}`,
      "_blank",
      "noopener,noreferrer,width=600,height=400",
    );
  }, [shareText, jobUrl]);

  const handleNativeShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareText, url: jobUrl });
      } catch {
        // User cancelled — ignore
      }
    } else {
      setOpen((v) => !v);
    }
  }, [shareText, jobUrl]);

  if (variant === "icon") {
    return (
      <div className="relative">
        <button
          onClick={handleNativeShare}
          className="inline-flex items-center justify-center rounded-xl border border-border bg-secondary/80 p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={t("share")}
        >
          <Share2 className="h-3.5 w-3.5" />
        </button>

        {open && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-border bg-popover p-2 shadow-lg">
              <ShareOptions
                t={t}
                onWhatsApp={shareWhatsApp}
                onLinkedIn={shareLinkedIn}
                onX={shareX}
                onCopyLink={handleCopyLink}
                copied={copied}
                onClose={() => setOpen(false)}
              />
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={handleNativeShare}
        className="gap-2 rounded-xl"
      >
        <Share2 className="h-4 w-4" />
        {t("share")}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 w-56 rounded-2xl border border-border bg-popover p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">{t("shareThisJob")}</span>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <ShareOptions
              t={t}
              onWhatsApp={shareWhatsApp}
              onLinkedIn={shareLinkedIn}
              onX={shareX}
              onCopyLink={handleCopyLink}
              copied={copied}
              onClose={() => setOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ShareOptions({
  t,
  onWhatsApp,
  onLinkedIn,
  onX,
  onCopyLink,
  copied,
  onClose,
}: {
  t: ReturnType<typeof useTranslations>;
  onWhatsApp: () => void;
  onLinkedIn: () => void;
  onX: () => void;
  onCopyLink: () => void;
  copied: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => { onWhatsApp(); onClose(); }}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
      >
        <span className="text-green-600">{WHATSAPP_ICON}</span>
        {t("whatsApp")}
      </button>
      <button
        onClick={() => { onLinkedIn(); onClose(); }}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
      >
        <span className="text-blue-700">{LINKEDIN_ICON}</span>
        {t("linkedIn")}
      </button>
      <button
        onClick={() => { onX(); onClose(); }}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
      >
        <span className="text-foreground">{X_ICON}</span>
        {t("xTwitter")}
      </button>
      <div className="my-1 border-t border-border" />
      <button
        onClick={onCopyLink}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-green-600">{t("linkCopied")}</span>
          </>
        ) : (
          <>
            <Link2 className="h-4 w-4 text-muted-foreground" />
            {t("copyLink")}
          </>
        )}
      </button>
    </div>
  );
}
