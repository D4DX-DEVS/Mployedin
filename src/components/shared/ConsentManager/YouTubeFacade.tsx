"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConsent } from "@/hooks/useConsent";
import { CONSENT_EVENT, readConsent } from "@/lib/consent/client";
import { recordConsentChoice } from "@/lib/consent/recordChoice";
import { allowed } from "@/lib/consent/state";
import { youtubeEmbedSrc, youtubeWatchUrl } from "@/lib/cms/youtube";

export interface YouTubeFacadeLabels {
  /** The play button: "Play video (loads YouTube)". */
  play: string;
  /** The link to the public watch page. */
  watchOnYoutube: string;
  /** [LEGAL] The disclosure under the button: playing loads content from YouTube (Google) and may set cookies. */
  notice: string;
  /** The checkbox that turns Videos on for the whole site. */
  always: string;
  /** Its description: it changes the Cookie settings for the whole site, not only this video. */
  alwaysHint?: string;
  /** Screen-reader suffix for the new-tab link (common.opensInNewTab). */
  newTab?: string;
}

interface YouTubeFacadeProps {
  /** A validated 11-character id from parseYouTubeId. */
  videoId: string;
  title: string;
  labels: YouTubeFacadeLabels;
  /** The page's language, for the receipt "Always play videos" sends. */
  locale: string;
}

// Same allow-list the landing page's embeds always had. Autoplay is only asked of the player on a
// click the visitor just made (see youtubeEmbedSrc), never on load.
const FRAME_ALLOW = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

/**
 * A YouTube video that loads only when asked.
 *
 * Until the visitor plays it (or has turned Videos on in Cookie settings) there is no iframe, so
 * YouTube and Google receive nothing; the placeholder is drawn from our own assets (no thumbnail
 * from ytimg.com). Pressing Play loads this one video from youtube-nocookie.com and does not change
 * the site-wide choice; "Always play videos" turns Videos on for the whole site, as a recorded
 * cookie choice (recordConsentChoice: receipt, cleanup, banner closes). If Videos is turned off
 * later (CONSENT_EVENT), the iframe is removed.
 *
 * The placeholder and the player sit in the same 16:9 frame, so pressing Play changes nothing
 * about the card's height and the page below it does not move.
 */
export function YouTubeFacade({ videoId, title, labels, locale }: YouTubeFacadeProps) {
  const { allows } = useConsent();
  const [played, setPlayed] = useState(false);
  const titleId = useId();
  const checkboxId = useId();
  const hintId = useId();
  const frameRef = useRef<HTMLIFrameElement>(null);
  // The button or checkbox the visitor pressed unmounts with the placeholder, which would drop
  // keyboard and screen-reader focus on the page; hand it to the player instead.
  const focusPlayer = useRef(false);

  // Withdrawing Videos takes down a video played by a single click as well as the ones the choice allowed.
  useEffect(() => {
    const onChange = () => {
      if (!allowed(readConsent(), "media")) setPlayed(false);
    };
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  const loaded = allows("media") || played;

  useEffect(() => {
    if (loaded && focusPlayer.current) {
      focusPlayer.current = false;
      frameRef.current?.focus();
    }
  }, [loaded]);

  const play = () => {
    focusPlayer.current = true;
    setPlayed(true);
  };

  const alwaysPlay = (checked: boolean | "indeterminate") => {
    if (checked !== true) return;
    // A cookie choice like any other: stored, receipted, and the banner (if open) closes. No choice
    // made yet counts as display settings allowed (owner decision D1), as the banner does. The
    // helper never rejects; the store happens before it first yields, so the event has fired by now.
    void recordConsentChoice({ preferences: readConsent()?.preferences ?? true, media: true }, { locale, source: "facade" });
    // The tick is also a request to play this video; if the cookie can't be stored it still plays once.
    play();
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-[hsl(var(--brand-blue-dark))]">
      {/* One 16:9 frame for both states, so the card is the same height before and after Play. */}
      <div data-youtube-frame="" className="aspect-video">
        {loaded ? (
          <iframe
            ref={frameRef}
            src={youtubeEmbedSrc(videoId, { autoplay: played })}
            title={title}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-full w-full"
            allow={FRAME_ALLOW}
            allowFullScreen
          />
        ) : (
          // Kept compact (icon inside the button, one-line title) so the controls fit the 16:9 frame
          // from about 340px wide; the title is repeated in full under the card.
          <div className="flex min-h-full flex-col items-center justify-center gap-1 px-3 py-2 text-center text-white sm:px-4">
            <p id={titleId} className="line-clamp-1 max-w-full text-sm font-extrabold leading-snug">
              {title}
            </p>
            <Button
              type="button"
              onClick={play}
              aria-describedby={titleId}
              className="h-auto min-h-11 whitespace-normal bg-white px-5 py-2 text-center font-extrabold text-[hsl(var(--brand-blue-dark))] shadow-none hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white [&_svg]:size-5"
            >
              <PlayCircle className="shrink-0" aria-hidden="true" />
              {labels.play}
            </Button>
            <p className="max-w-sm text-xs leading-4 text-white/80">{labels.notice}</p>
            <div className="flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-5">
              <label htmlFor={checkboxId} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold">
                <Checkbox
                  id={checkboxId}
                  checked={false}
                  onCheckedChange={alwaysPlay}
                  aria-describedby={labels.alwaysHint ? hintId : undefined}
                  className="size-5 border-white/70 bg-transparent shadow-none focus-visible:ring-2 focus-visible:ring-white"
                />
                {labels.always}
              </label>
              {/* Visible from sm up; on a phone the 16:9 frame has no room, so screen readers get it. */}
              {labels.alwaysHint && (
                <span id={hintId} className="sr-only text-[11px] leading-4 text-white/75 sm:not-sr-only sm:basis-full">
                  {labels.alwaysHint}
                </span>
              )}
              <a
                href={youtubeWatchUrl(videoId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1 rounded-md text-xs font-semibold underline underline-offset-2 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {labels.watchOnYoutube}
                {labels.newTab && <span className="sr-only"> {labels.newTab}</span>}
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
