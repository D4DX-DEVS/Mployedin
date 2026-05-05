export { default } from "@/proxy";

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|llms\\.txt|manifest\\.json|manifest\\.webmanifest|sw\\.js|workbox-[^/]*\\.js|icons/|flags/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
