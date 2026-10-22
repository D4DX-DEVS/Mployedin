/**
 * The one place that decides whether a CMS video URL may be embedded.
 *
 * Only these YouTube shapes yield an id; anything else yields null and the
 * landing page shows nothing for it. Videos are always framed from the
 * privacy-enhanced host (youtube-nocookie.com), and only after the visitor
 * asks for them (see components/shared/ConsentManager/YouTubeFacade).
 *
 * Pure and dependency-free, so the CMS validator, the landing page and the
 * tests share it.
 */

// The hosts parseYouTubeId reads a video id from. (The CMS validator calls parseYouTubeId itself, so it follows them.)
const WATCH_HOSTS = new Set<string>(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const NOCOOKIE_HOSTS = new Set<string>(["youtube-nocookie.com", "www.youtube-nocookie.com"]);
const SHORT_HOST = "youtu.be";

/** A YouTube video id: 11 characters of base64url. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function asId(candidate: string | null | undefined): string | null {
  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

/** First path segment after `prefix` ("/embed/ID/extra" gives "ID"), or null. */
function segmentAfter(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  return pathname.slice(prefix.length).split("/")[0] || null;
}

/**
 * The 11-character video id in a YouTube watch, short, embed or privacy-enhanced
 * embed URL, or null for anything else (other hosts, look-alike hosts, channels,
 * playlists, other schemes, a malformed id).
 */
export function parseYouTubeId(url: string): string | null {
  if (typeof url !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  // URL lower-cases the hostname, so "WWW.YouTube.com" compares equal below.
  const host = parsed.hostname;

  if (host === SHORT_HOST) return asId(segmentAfter(parsed.pathname, "/"));
  if (WATCH_HOSTS.has(host)) {
    if (parsed.pathname === "/watch") return asId(parsed.searchParams.get("v"));
    return asId(segmentAfter(parsed.pathname, "/embed/"));
  }
  if (NOCOOKIE_HOSTS.has(host)) return asId(segmentAfter(parsed.pathname, "/embed/"));
  return null;
}

/** The iframe address: always the privacy-enhanced host. Autoplay only for a click the visitor just made. */
export function youtubeEmbedSrc(id: string, options: { autoplay?: boolean } = {}): string {
  const base = `https://www.youtube-nocookie.com/embed/${id}`;
  return options.autoplay ? `${base}?autoplay=1` : base;
}

/** The public watch page, for the "Watch on YouTube" link. */
export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}
