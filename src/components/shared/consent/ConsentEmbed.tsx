"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConsent } from "@/hooks/useConsent";
import { getConsentSnapshot, openConsentPreferences, saveConsent } from "@/lib/consent/client";
import { ALL_DENIED } from "@/lib/consent/config";

/** Map a YouTube / Vimeo page URL to its privacy-enhanced embed URL. */
export function toEmbedUrl(url: string): { src: string; provider: string } {
  const yt = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return { src: `https://www.youtube-nocookie.com/embed/${yt[1]}`, provider: "YouTube" };
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { src: `https://player.vimeo.com/video/${vimeo[1]}?dnt=1`, provider: "Vimeo" };
  return { src: url, provider: new URL(url, "https://example.invalid").hostname || "third party" };
}

/**
 * Third-party video players set their own cookies, so they are "functional"
 * content that needs consent. Until then show a click-to-load placeholder:
 * "Play this video" loads only this player (no stored choice); "Always allow"
 * opts in to the functional category.
 */
export function ConsentEmbed({ url, title, locale }: { url: string; title: string; locale?: string }) {
  const t = useTranslations("consent");
  const allowed = useConsent("functional");
  const [loadOnce, setLoadOnce] = useState(false);
  const { src, provider } = toEmbedUrl(url);

  if (allowed || loadOnce) {
    return (
      <iframe
        src={src}
        title={title}
        className="h-full w-full"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }

  const allowAlways = () => {
    const current = getConsentSnapshot();
    saveConsent({ choices: { ...(current?.choices ?? ALL_DENIED), functional: true }, method: "custom", locale });
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-muted p-4 text-center">
      <PlayCircle className="h-10 w-10 text-primary" aria-hidden />
      <p className="max-w-sm text-sm text-foreground">{t("embedBlocked", { provider })}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" onClick={() => setLoadOnce(true)} aria-label={t("embedPlayOnceLabel", { title })}>
          {t("embedPlayOnce")}
        </Button>
        <Button size="sm" variant="outline" onClick={allowAlways}>
          {t("embedAllowAlways")}
        </Button>
        <Button size="sm" variant="link" onClick={openConsentPreferences}>
          {t("cookieSettings")}
        </Button>
      </div>
    </div>
  );
}
