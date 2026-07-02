"use client";

import { useState, useEffect, useCallback } from "react";
import { CalendarDays, Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Subscribable calendar feed card. Exposes the user's secret iCal feed URL so
 * Google Calendar / Apple Calendar / Outlook can subscribe and stay in sync
 * automatically (reschedules included) — unlike a one-off .ics download.
 */
export function CalendarFeedCard() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/calendar/feed-token")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.url) setUrl(data.url);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (non-https/permission) — user can select manually
    }
  }, [url]);

  const rotate = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/calendar/feed-token", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.url) setUrl(data.url);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section className="card-base rounded-[28px] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Calendar
          </div>
          <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
            <CalendarDays className="h-4 w-4" />
            Calendar sync
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Subscribe from Google Calendar, Apple Calendar or Outlook. Your
            interviews stay up to date automatically — including reschedules.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading feed link…
        </div>
      ) : url ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 font-mono text-xs text-foreground"
              aria-label="Calendar feed URL"
            />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copy} className="gap-1.5 rounded-xl">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={rotate}
                disabled={busy}
                className="gap-1.5 rounded-xl text-muted-foreground"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Reset link
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Google Calendar: Other calendars → From URL. Apple Calendar: File →
            New Calendar Subscription. Anyone with this link can see your
            interview schedule — use Reset link if it leaks.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Could not load the feed link. Refresh the page to try again.
        </p>
      )}
    </section>
  );
}
