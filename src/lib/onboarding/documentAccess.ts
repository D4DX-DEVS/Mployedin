import { getPresignedUrl, isStoredFileUrl, urlToKey } from "@/lib/storage/spaces";

/**
 * Onboarding uploads (payslips, IDs, contracts) live in the private "documents"
 * folder, so the stored address answers 403 AccessDenied in a browser. Every
 * address an onboarding route hands out is a signed one instead, good for an
 * hour and issued only after that route's own access check. The stored address
 * in the database never changes.
 */
const VIEW_URL_TTL_SECONDS = 60 * 60;

/** Signed address for one of our own files; a link to another site passes through. */
export async function signedOnboardingDocUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  if (!isStoredFileUrl(url)) return url;
  try {
    return await getPresignedUrl(urlToKey(url), VIEW_URL_TTL_SECONDS, { inline: true });
  } catch {
    return url;
  }
}

/** The same documents with every stored file address swapped for a signed one. */
export async function withSignedDocUrls<T extends { url?: string | null }>(docs: T[]): Promise<T[]> {
  return Promise.all(
    docs.map(async (doc) => (doc.url ? { ...doc, url: (await signedOnboardingDocUrl(doc.url)) ?? undefined } : doc)),
  );
}
