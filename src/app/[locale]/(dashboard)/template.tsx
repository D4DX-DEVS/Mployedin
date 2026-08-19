/**
 * 2FA is OPTIONAL (product decision 2026-08-19): the login flow challenges for
 * a TOTP code only when the account has twoFactorEnabled. There is no forced
 * enrollment — this template is a deliberate pass-through kept only so the
 * removed gate (see git history) has an obvious home if policy changes again.
 */
export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
