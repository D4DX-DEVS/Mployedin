/** Same env-var fallback chain used by every other route that needs the app's public origin. */
export function getAppBaseUrl(): string {
  return process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
