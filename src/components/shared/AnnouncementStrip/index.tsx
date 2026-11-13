"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { X, AlertCircle, CheckCircle, AlertTriangle, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { IBanner } from "@/models/Banner";

interface AnnouncementStripProps {
  locale: string;
}

const styleConfig = {
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-900",
    icon: AlertCircle,
    iconClass: "text-blue-600",
  },
  success: {
    bg: "bg-green-50",
    border: "border-green-200",
    text: "text-green-900",
    icon: CheckCircle,
    iconClass: "text-green-600",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-900",
    icon: AlertTriangle,
    iconClass: "text-amber-600",
  },
};

function getDismissedKeys(): Set<string> {
  try {
    const stored = localStorage.getItem("mployedin:dismissed-announcements");
    return new Set(stored ? JSON.parse(stored) : []);
  } catch {
    return new Set();
  }
}

function saveDismissedKey(key: string, allKeys: string[]): void {
  try {
    const newSet = new Set([...allKeys, key]);
    localStorage.setItem("mployedin:dismissed-announcements", JSON.stringify([...newSet]));
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

export function AnnouncementStrip({ locale }: AnnouncementStripProps) {
  const t = useTranslations("portalAnnouncements");
  const [announcements, setAnnouncements] = useState<IBanner[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const dismissed = getDismissedKeys();
    setDismissed(dismissed);

    const fetchAnnouncements = async () => {
      try {
        const res = await fetch("/api/user/announcements");
        if (res.ok) {
          const data = await res.json();
          setAnnouncements(data.announcements || []);
        }
      } catch {
        // No strip is better than an error on every page.
      } finally {
        setLoading(false);
      }
    };

    fetchAnnouncements();
  }, []);

  const visibleAnnouncements = announcements.filter((a) => !dismissed.has(a._id?.toString() || ""));

  if (loading || visibleAnnouncements.length === 0) {
    return null;
  }

  const currentAnnouncement = visibleAnnouncements[currentIndex];
  if (!currentAnnouncement) {
    return null;
  }

  const isRtl = locale === "ar";
  const title = isRtl ? currentAnnouncement.titleAr || currentAnnouncement.title : currentAnnouncement.title;
  const text = isRtl ? currentAnnouncement.subtitleAr || currentAnnouncement.subtitle : currentAnnouncement.subtitle;
  const linkText = isRtl ? currentAnnouncement.linkTextAr || currentAnnouncement.linkText : currentAnnouncement.linkText;
  const style = (currentAnnouncement.style as keyof typeof styleConfig) || "info";
  const config = styleConfig[style];
  const Icon = config.icon;

  const handleDismiss = () => {
    const allIds = announcements.map((a) => a._id?.toString() || "");
    const id = currentAnnouncement._id?.toString() || "";
    saveDismissedKey(id, allIds);
    setDismissed((prev) => new Set([...prev, id]));

    if (currentIndex >= visibleAnnouncements.length - 1) {
      setCurrentIndex(Math.max(0, currentIndex - 1));
    }
  };

  const contentElement = (
    <div className="flex flex-col gap-2">
      {title && <p className={`text-sm font-semibold ${config.text}`}>{title}</p>}
      {text && <p className={`text-sm ${config.text}`}>{text}</p>}
      {linkText && currentAnnouncement.linkUrl && (
        <Link
          href={currentAnnouncement.linkUrl}
          className={`text-xs font-semibold underline hover:opacity-80 transition-opacity ${config.text}`}
          target={currentAnnouncement.linkUrl.startsWith("http") ? "_blank" : undefined}
          rel={currentAnnouncement.linkUrl.startsWith("http") ? "noopener noreferrer" : undefined}
        >
          {linkText}
        </Link>
      )}
    </div>
  );

  return (
    <div
      className={`border-b ${config.border} ${config.bg} px-3 sm:px-4 lg:px-6 py-3 sm:py-4`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="mt-0.5 flex-shrink-0">
          <Icon className={`h-5 w-5 ${config.iconClass}`} aria-hidden="true" />
        </div>

        <div className="flex-1 min-w-0">{contentElement}</div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {visibleAnnouncements.length > 1 && (
            <span className={`text-xs font-medium ${config.text} whitespace-nowrap`}>
              {t("count", {
                current: currentIndex + 1,
                total: visibleAnnouncements.length,
              })}
            </span>
          )}

          {visibleAnnouncements.length > 1 && (
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => (i + 1) % visibleAnnouncements.length)}
              className={`inline-flex size-9 items-center justify-center rounded hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${config.text}`}
              aria-label={t("next")}
            >
              <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
            </button>
          )}

          {currentAnnouncement.dismissible && (
            <button
              type="button"
              onClick={handleDismiss}
              className={`inline-flex size-9 items-center justify-center rounded hover:bg-black/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${config.text}`}
              aria-label={t("dismiss")}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
