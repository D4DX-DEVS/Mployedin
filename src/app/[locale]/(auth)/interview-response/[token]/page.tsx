"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { CalendarDays, CheckCircle2, Clock, Loader2, MapPin, Video, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatZonedDateTime, resolveViewerTimeZone } from "@/lib/datetime/zone";

/**
 * Where a candidate answers an interview invitation straight from their email.
 *
 * Lives in the (auth) group deliberately: the person arriving has no session,
 * and under the dashboard layout they would be bounced to login and lose the
 * token. The secret token in the path is the credential.
 *
 * Nothing here mutates on load. Mail clients and security scanners fetch every
 * link in a message, so a GET that recorded an answer would accept every
 * invitation the moment it was delivered — the buttons below are the only way
 * anything is written.
 */

type Answer = "confirmed" | "declined" | "reschedule_requested";

interface Invitation {
  jobTitle: string | null;
  scheduledAt: string;
  duration: number;
  type: string;
  location: string | null;
  currentResponse: string;
  answerable: boolean;
}

export default function InterviewResponsePage() {
  const t = useTranslations("interviewResponse");
  const locale = useLocale();
  const { token } = useParams<{ token: string }>();

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answered, setAnswered] = useState<Answer | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/interviews/response/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("unavailable");
        return res.json();
      })
      .then((data: Invitation) => {
        if (cancelled) return;
        setInvitation(data);
        if (data.currentResponse !== "pending") setAnswered(data.currentResponse as Answer);
      })
      .catch(() => {
        if (!cancelled) setLoadError(t("linkInvalid"));
      });
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const submit = useCallback(
    async (response: Answer) => {
      setError(null);
      setBusy(response);
      try {
        const res = await fetch(`/api/interviews/response/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ response, ...(response === "reschedule_requested" ? { note } : {}) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError((data as { error?: string }).error ?? t("genericError"));
          return;
        }
        setAnswered(response);
      } catch {
        setError(t("genericError"));
      } finally {
        setBusy(null);
      }
    },
    [token, note, t],
  );

  if (loadError) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 text-center">
          <XCircle className="size-10 text-destructive" />
          <h1 className="text-lg font-semibold text-foreground">{t("linkInvalidTitle")}</h1>
          <p className="text-sm text-muted-foreground">{loadError}</p>
        </div>
      </Shell>
    );
  }

  if (!invitation) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </div>
      </Shell>
    );
  }

  // The zone label matters more here than anywhere else in the product: the
  // reader is often in a different country from the employer who booked it.
  const when = formatZonedDateTime(invitation.scheduledAt, {
    timeZone: resolveViewerTimeZone(),
    locale,
    dateStyle: "full",
  });

  return (
    <Shell>
      <div className="space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>
          {invitation.jobTitle && (
            <p className="text-sm text-muted-foreground">
              {t("forRole", { role: invitation.jobTitle })}
            </p>
          )}
        </div>

        <dl className="space-y-2.5 rounded-xl border border-border/60 bg-muted/30 p-4">
          <Row icon={<CalendarDays className="size-4" />} label={t("whenLabel")} value={when} />
          <Row
            icon={<Clock className="size-4" />}
            label={t("durationLabel")}
            value={t("minutes", { count: invitation.duration })}
          />
          <Row
            icon={invitation.type === "video" ? <Video className="size-4" /> : <MapPin className="size-4" />}
            label={t("formatLabel")}
            value={
              invitation.type === "video"
                ? t("videoCall")
                : invitation.location ?? (invitation.type === "offline" ? t("inPerson") : t("hybrid"))
            }
          />
        </dl>

        {answered ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <div>
              {/* Explicit, not t(`answered_${x}`): a built key is invisible to
                  tsc and to the key-parity check, and next-intl throws on a
                  miss, which takes the whole page down. */}
              <p className="text-sm font-medium text-foreground">
                {answered === "confirmed"
                  ? t("answeredConfirmed")
                  : answered === "declined"
                    ? t("answeredDeclined")
                    : t("answeredReschedule")}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("answeredHint")}</p>
            </div>
          </div>
        ) : !invitation.answerable ? (
          <p className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
            {t("noLongerAnswerable")}
          </p>
        ) : (
          <div className="space-y-3">
            {error && (
              <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}

            {showNote && (
              <div className="space-y-1.5">
                <Label htmlFor="note">{t("noteLabel")}</Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder={t("notePlaceholder")}
                />
              </div>
            )}

            {/* Always stacked. A `sm:flex-row` here keys off the *viewport*,
                but this page sits in the auth layout's narrow right-hand
                column, so three buttons abreast clipped "Decline" off the edge
                at every desktop width. */}
            <div className="flex flex-col gap-2">
              <Button
                className="min-h-11 flex-1"
                disabled={busy !== null}
                onClick={() => submit("confirmed")}
              >
                {busy === "confirmed" && <Loader2 className="size-4 animate-spin" />}
                {t("confirm")}
              </Button>
              <Button
                variant="outline"
                className="min-h-11 flex-1"
                disabled={busy !== null}
                onClick={() => (showNote ? submit("reschedule_requested") : setShowNote(true))}
              >
                {busy === "reschedule_requested" && <Loader2 className="size-4 animate-spin" />}
                {t("requestReschedule")}
              </Button>
              <Button
                variant="outline"
                className="min-h-11 flex-1 text-destructive hover:text-destructive"
                disabled={busy !== null}
                onClick={() => submit("declined")}
              >
                {busy === "declined" && <Loader2 className="size-4 animate-spin" />}
                {t("decline")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

/**
 * No card and no max-width of its own.
 *
 * The (auth) layout already puts children inside a `max-w-md` panel that
 * carries `.panel-body`'s border, radius and padding. Adding a second card at
 * `max-w-lg` (512px) inside a 448px container overflowed it and read as two
 * nested boxes — the page appeared to collapse, and "Decline" was clipped off
 * the right edge.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return <div className="w-full min-w-0">{children}</div>;
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm font-medium text-foreground">{value}</dd>
      </div>
    </div>
  );
}
