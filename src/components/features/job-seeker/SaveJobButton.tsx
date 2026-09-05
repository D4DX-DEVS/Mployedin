"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { csrfFetch } from "@/lib/security/csrf-client";
import { toast } from "sonner";

interface SaveJobButtonProps {
  jobId: string;
  initialSaved?: boolean;
  size?: "sm" | "lg";
  variant?: "icon" | "default";
}

export function SaveJobButton({ jobId, initialSaved = false, size = "lg", variant = "default" }: SaveJobButtonProps) {
  const t = useTranslations("jobFeed.card");
  const tToast = useTranslations("jobFeed.toast");
  const [isSaved, setIsSaved] = useState(initialSaved);
  const [isPending, setIsPending] = useState(false);

  // Hydrate saved state on mount
  useEffect(() => {
    const hydrateState = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/save`);
        if (res.ok) {
          const data = await res.json();
          setIsSaved(!!data.saved);
        }
      } catch {
        // Fail silently, use the initial state
      }
    };
    hydrateState();
  }, [jobId]);

  const handleSave = async () => {
    setIsPending(true);
    try {
      const res = await csrfFetch(`/api/jobs/${jobId}/save`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setIsSaved(data.saved ?? false);
        toast.success(data.saved ? tToast("jobSaved") : tToast("jobUnsaved"));
      } else {
        toast.error(tToast("savedUpdateFailed"));
      }
    } catch {
      toast.error(tToast("savedUpdateFailed"));
    } finally {
      setIsPending(false);
    }
  };

  if (variant === "icon") {
    return (
      <button
        onClick={handleSave}
        disabled={isPending}
        aria-label={isSaved ? t("saved") : t("save")}
        className={`inline-flex items-center justify-center h-10 w-10 rounded-full transition-colors disabled:opacity-60 ${
          isSaved
            ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
            : "bg-secondary/80 text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isSaved ? (
          <BookmarkCheck className="h-4 w-4" />
        ) : (
          <Bookmark className="h-4 w-4" />
        )}
      </button>
    );
  }

  return (
    <Button
      onClick={handleSave}
      disabled={isPending}
      variant={isSaved ? "default" : "outline"}
      size={size}
      className={`gap-2 rounded-xl ${isSaved ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : ""}`}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isSaved ? (
        <BookmarkCheck className="h-4 w-4" />
      ) : (
        <Bookmark className="h-4 w-4" />
      )}
      <span>{isSaved ? t("saved") : t("save")}</span>
    </Button>
  );
}
