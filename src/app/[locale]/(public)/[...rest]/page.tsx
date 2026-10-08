import { notFound } from "next/navigation";

/**
 * Unknown public URLs (e.g. a stale /en/about link) land here so the 404 is
 * rendered by (public)/not-found.tsx inside the public layout — with header
 * and footer — rather than by the bare root not-found page. Real routes are
 * static or more specific segments and always win over this catch-all.
 */
export default function UnknownPublicPage(): never {
  notFound();
}
