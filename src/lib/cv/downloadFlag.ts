/**
 * Which candidate-CV addresses are an actual download. The CV route counts a
 * seeker's "CV downloads" only for a request that says `download=1`; the
 * viewer's preview fetch never does. Wherever a link or fetch means "give me
 * the file" (the viewer's Download, the "Original CV" menu links, the bulk
 * export), the address goes through here.
 *
 * Only the candidate CV route's file address is touched: any other URL, and the
 * Standardised view (`kind=built`, generated, never counted), come back as given.
 * Client-safe (no server imports).
 */
const CANDIDATE_CV_FILE = /^(\/api\/employers\/candidates\/[^/?#]+\/cv)(\?[^#]*)?(#.*)?$/i;

export function withDownloadFlag<T extends string | null | undefined>(url: T): T {
  if (!url) return url;
  const match = CANDIDATE_CV_FILE.exec(url);
  if (!match) return url;
  const [, path, query = "", hash = ""] = match;
  const params = new URLSearchParams(query.slice(1));
  if (params.get("kind") === "built") return url;
  if (params.get("download") === "1") return url;
  return `${path}${query ? `${query}&` : "?"}download=1${hash}` as T;
}
