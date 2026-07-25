import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import LinkedIn from "next-auth/providers/linkedin";
import Apple from "next-auth/providers/apple";
import { z } from "zod";
import connectDB from "@/lib/db/mongoose";
import { User } from "@/models/User";
import type { UserRole } from "@/models/User";
import { Employer } from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import { logActivity } from "@/lib/audit/log";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import type { CompanyRole } from "@/models/CompanyUser";
import logger from "@/lib/logger";
import { rehostExternalAvatar } from "@/lib/storage/rehost-avatar";
import { fetchLinkedInExtras } from "@/lib/auth/linkedin-profile";
import { encrypt, decrypt } from "@/lib/security/encryption";
import { verifyTotp, hashRecoveryCode } from "@/lib/security/totp";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { ensureEmployerOwnerMembership } from "@/lib/employers/company-membership";
import { getClientIp } from "@/lib/security/clientIp";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  rememberMe: z.string().optional(),
  totpCode: z.string().optional(),
});

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/** Thrown when a 2FA-enabled account signs in without a TOTP code. */
class TwoFactorRequiredError extends CredentialsSignin {
  code = "2fa_required";
}
/** Thrown when the provided TOTP / recovery code is wrong. */
class TwoFactorInvalidError extends CredentialsSignin {
  code = "2fa_invalid";
}
/** Thrown when the account is temporarily locked from failed attempts. */
class AccountLockedError extends CredentialsSignin {
  code = "account_locked";
}
/** Thrown when failed credential attempts from one IP exceed the safety limit. */
class LoginRateLimitedError extends CredentialsSignin {
  code = "login_rate_limited";
}

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      async authorize(credentials, request) {
        try {
        // IP-level brute-force protection (complements per-account lockout).
        // Throttles distributed attacks that rotate across many accounts.
        const ip = getClientIp(request?.headers ?? new Headers());
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        await connectDB();
        const user = await User.findOne({
          email: parsed.data.email.toLowerCase(),
        }).select("+passwordHash +failedLoginAttempts +lockUntil +twoFactorSecretEnc +twoFactorRecoveryCodes");

        if (!user || !user.passwordHash) {
          const ipCheck = await checkRateLimit(ip, {
            limit: 10,
            windowSec: 300,
            prefix: "login-ip-failed",
          });
          logActivity({
            action: "login.failed",
            resource: "auth",
            meta: { email: parsed.data.email, reason: user ? "no_password" : "user_not_found" },
          });
          if (!ipCheck.allowed) throw new LoginRateLimitedError();
          return null;
        }

        // Check if account is locked
        if (user.isLocked()) {
          logActivity({
            actorId: user._id.toString(),
            actorRole: user.role,
            action: "login.failed",
            resource: "auth",
            meta: { email: parsed.data.email, reason: "account_locked" },
          });
          throw new AccountLockedError();
        }

        // Check if account is active
        if (!user.isActive) {
          logActivity({
            actorId: user._id.toString(),
            actorRole: user.role,
            action: "login.failed",
            resource: "auth",
            meta: { email: parsed.data.email, reason: "account_inactive" },
          });
          return null;
        }

        const valid = await user.comparePassword(parsed.data.password);
        if (!valid) {
          const ipCheck = await checkRateLimit(ip, {
            limit: 10,
            windowSec: 300,
            prefix: "login-ip-failed",
          });
          if (!ipCheck.allowed) {
            logActivity({
              actorId: user._id.toString(),
              actorRole: user.role,
              action: "login.failed",
              resource: "auth",
              meta: { email: user.email, ip, reason: "ip_rate_limited" },
            });
            throw new LoginRateLimitedError();
          }

          // Increment failed attempts
          const attempts = (user.failedLoginAttempts || 0) + 1;
          const nowLocked = attempts >= MAX_FAILED_ATTEMPTS;
          const update: Record<string, unknown> = { failedLoginAttempts: attempts };
          if (nowLocked) {
            update.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
          }
          await User.findByIdAndUpdate(user._id, update);

          if (nowLocked) {
            // Distinct audit event + best-effort notification to the account owner.
            logActivity({
              actorId: user._id.toString(),
              actorRole: user.role,
              action: "account.locked",
              resource: "auth",
              meta: { email: user.email, ip, failedAttempts: attempts, lockMinutes: LOCK_DURATION_MS / 60000 },
            });
            const appUrl =
              process.env.NEXT_PUBLIC_BASE_URL ??
              process.env.NEXTAUTH_URL ??
              process.env.NEXT_PUBLIC_APP_URL ??
              "http://localhost:3000";
            sendEmail({
              to: user.email,
              ...EmailTemplates.accountLocked(user.name || "there", LOCK_DURATION_MS / 60000, `${appUrl}/en/forgot-password`),
              userId: user._id.toString(),
              source: "auth",
              category: "security",
            }).catch((err) => logger.warn({ err, userId: user._id.toString() }, "Failed to send account-locked email"));
          }

          logActivity({
            actorId: user._id.toString(),
            actorRole: user.role,
            action: "login.failed",
            resource: "auth",
            meta: {
              email: parsed.data.email,
              reason: nowLocked ? "account_locked" : "invalid_password",
              failedAttempts: attempts,
            },
          });
          if (nowLocked) throw new AccountLockedError();
          return null;
        }

        // ── Two-factor authentication (TOTP) ─────────────────────────────
        // Enforced after password validation for enrolled accounts
        // (admin / super_agent enroll via /api/user/2fa).
        if (user.twoFactorEnabled && user.twoFactorSecretEnc) {
          const totpCode = (parsed.data.totpCode ?? "").trim();
          if (!totpCode) {
            throw new TwoFactorRequiredError();
          }

          // Throttle code guesses per account (6-digit codes must not be brute-forceable).
          const totpRl = await checkRateLimit(`2fa-login:${user._id}`, { limit: 8, windowSec: 300, prefix: "2fa-login" });
          if (!totpRl.allowed) {
            logActivity({
              actorId: user._id.toString(),
              actorRole: user.role,
              action: "login.failed",
              resource: "auth",
              meta: { email: user.email, reason: "2fa_rate_limited" },
            });
            throw new TwoFactorInvalidError();
          }

          const secret = decrypt(user.twoFactorSecretEnc);
          let twoFaOk = verifyTotp(secret, totpCode);

          // Fall back to single-use recovery codes.
          if (!twoFaOk) {
            const codeHash = hashRecoveryCode(totpCode);
            if ((user.twoFactorRecoveryCodes ?? []).includes(codeHash)) {
              await User.findByIdAndUpdate(user._id, {
                $pull: { twoFactorRecoveryCodes: codeHash },
              });
              twoFaOk = true;
              logActivity({
                actorId: user._id.toString(),
                actorRole: user.role,
                action: "2fa.recovery_code_used",
                resource: "auth",
                meta: { email: user.email },
              });
            }
          }

          if (!twoFaOk) {
            logActivity({
              actorId: user._id.toString(),
              actorRole: user.role,
              action: "login.failed",
              resource: "auth",
              meta: { email: user.email, reason: "2fa_invalid" },
            });
            throw new TwoFactorInvalidError();
          }
        }

        // Reset failed attempts + look up onboarding status in parallel
        const [, jobSeeker] = await Promise.all([
          User.findByIdAndUpdate(user._id, {
            lastLogin: new Date(),
            failedLoginAttempts: 0,
            lockUntil: null,
          }),
          JobSeeker.findOne({ userId: user._id }).select("isOnboarded").lean(),
        ]);

        logActivity({
          actorId: user._id.toString(),
          actorRole: user.role,
          action: "login.success",
          resource: "auth",
          meta: { email: user.email, provider: "credentials" },
        });

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          image: user.avatar,
          role: user.role,
          locale: user.locale,
          isEmailVerified: user.isEmailVerified ?? false,
          isOnboarded: jobSeeker?.isOnboarded ?? false,
          rememberMe: parsed.data.rememberMe === "true",
        };
        } catch (err) {
          // Propagate typed 2FA signals to the client (surfaced as result.code).
          if (err instanceof CredentialsSignin) throw err;
          logger.error({ err }, "Credentials authorize error");
          return null;
        }
      },
    }),
    // ── Firebase Google Sign-In ──────────────────────────────────────────────
    // Client obtains a Firebase ID token via signInWithPopup, then passes it here.
    Credentials({
      id: "firebase",
      name: "Firebase",
      credentials: { idToken: { type: "text" } },
      async authorize(credentials) {
        try {
          const idToken = (credentials as { idToken?: string })?.idToken;
          if (!idToken) return null;

          const adminAuth = getFirebaseAdminAuth();
          const decoded = await adminAuth.verifyIdToken(idToken);

          const email = decoded.email?.toLowerCase();
          if (!email) return null;
          const isEmailVerified = decoded.email_verified ?? false;

          await connectDB();
          let dbUser = await User.findOne({ email });
          const providerName = decoded.name ?? email.split("@")[0];
          const providerAvatar = decoded.picture ?? null;

          if (!dbUser) {
            dbUser = await User.create({
              email,
              name: providerName,
              avatar: providerAvatar,
              role: "job_seeker",
              isEmailVerified,
              isActive: true,
              locale: "en",
              lastLogin: new Date(),
            });
            // Re-host the provider avatar on our own storage so the URL never expires.
            const rehosted = await rehostExternalAvatar(providerAvatar);
            if (rehosted) {
              await User.updateOne({ _id: dbUser._id }, { $set: { avatar: rehosted } });
              dbUser.avatar = rehosted;
            }
            // Create empty JobSeeker profile for new social-login users
            await JobSeeker.create({
              userId: dbUser._id,
              fullName: dbUser.name,
              isOnboarded: false,
              skills: [],
              experience: [],
              education: [],
              languages: [],
              certifications: [],
              preferredCountries: [],
              preferredRoles: [],
              preferredLocations: [],
            });

            logActivity({
              actorId: dbUser._id.toString(),
              actorRole: dbUser.role,
              action: "register.oauth",
              resource: "auth",
              meta: { email, provider: "firebase-google" },
            });

            // Send welcome email for new Firebase/Google users
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
            const dashboardUrl = `${baseUrl}/en/job-seeker`;
            await sendEmail({
              to: email,
              ...EmailTemplates.jobSeekerWelcome(dbUser.name || "there", dashboardUrl),
              source: "registration",
              category: "system",
            }).catch((err) =>
              logger.error({ err }, "[Firebase Registration] Failed to send welcome email")
            );

            return {
              id: dbUser._id.toString(),
              email: dbUser.email,
              name: dbUser.name,
              image: dbUser.avatar ?? providerAvatar,
              role: dbUser.role,
              locale: dbUser.locale,
              isEmailVerified,
              isOnboarded: false,
            };
          } else {
            const update: Record<string, unknown> = {};

            // Keep local profile aligned with trusted Firebase profile data.
            if (!dbUser.name && providerName) {
              update.name = providerName;
            }
            if (!dbUser.avatar && providerAvatar) {
              update.avatar = (await rehostExternalAvatar(providerAvatar)) ?? providerAvatar;
            }

            if (Object.keys(update).length > 0) {
              dbUser = await User.findByIdAndUpdate(dbUser._id, update, { new: true }) ?? dbUser;
            }
          }

          // Update lastLogin for returning Firebase/Google users
          await User.findByIdAndUpdate(dbUser._id, { lastLogin: new Date() });

          if (!dbUser.isActive) return null;

          // Look up isOnboarded for existing users
          const fbJobSeeker = await JobSeeker.findOne({ userId: dbUser._id }).select("isOnboarded").lean();

          logActivity({
            actorId: dbUser._id.toString(),
            actorRole: dbUser.role,
            action: "login.success",
            resource: "auth",
            meta: { email, provider: "firebase-google" },
          });

          return {
            id: dbUser._id.toString(),
            email: dbUser.email,
            name: dbUser.name,
            image: dbUser.avatar ?? providerAvatar,
            role: dbUser.role,
            locale: dbUser.locale,
            isEmailVerified,
            isOnboarded: fbJobSeeker?.isOnboarded ?? false,
          };
        } catch (err) {
          logger.error({ err }, "Firebase authorize error");
          return null;
        }
      },
    }),
    LinkedIn({
      clientId: process.env.LINKEDIN_CLIENT_ID!,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
      authorization: {
        params: { scope: "openid profile email" },
      },
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture ?? null,
        };
      },
    }),
    ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
      ? [Apple({
          clientId: process.env.APPLE_CLIENT_ID,
          clientSecret: process.env.APPLE_CLIENT_SECRET,
          profile(profile) {
            return {
              id: profile.sub,
              name: profile.name ?? profile.email?.split("@")[0] ?? "Apple User",
              email: profile.email,
              image: null,
            };
          },
        })]
      : []),
  ],
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 3 * 24 * 60 * 60,    // 3 days max (remember-me sessions)
    updateAge: 5 * 60,            // re-check DB every 5 min — catches password changes & deactivation quickly
  },
  pages: {
    signIn: "/en/login",
    error: "/en/login",
  },
  callbacks: {
    async jwt({ token, user, account, trigger, session: updateData }) {
      // Client called update() — merge the new values into the token.
      //
      // SECURITY: update() is a client-controlled POST to /api/auth/session, so
      // its payload must NEVER be trusted for authorization fields. Previously
      // `role`, `isEmailVerified`, and `isOnboarded` were copied straight from
      // the payload — any logged-in user could call
      // update({ role: "admin", isEmailVerified: true }) and mint themselves an
      // admin JWT. Cosmetic fields (name/image/locale) stay client-supplied;
      // authorization fields are re-read from the DB, which every legitimate
      // caller has already updated before calling update().
      if (trigger === "update" && updateData) {
        const data = updateData as Record<string, unknown>;
        if (data.locale !== undefined) token.locale = data.locale;
        if (typeof data.name === "string") token.name = data.name;
        if (data.image !== undefined) token.picture = data.image as string | null;
        if (data.role !== undefined || data.isEmailVerified !== undefined || data.isOnboarded !== undefined) {
          await connectDB();
          const dbUser = await User.findById(token.id)
            .select("role isEmailVerified")
            .lean() as { role?: UserRole; isEmailVerified?: boolean } | null;
          if (dbUser) {
            token.role = dbUser.role ?? token.role;
            token.isEmailVerified = dbUser.isEmailVerified ?? false;
          }
          if (data.isOnboarded !== undefined) {
            const js = await JobSeeker.findOne({ userId: token.id })
              .select("isOnboarded")
              .lean() as { isOnboarded?: boolean } | null;
            token.isOnboarded = js?.isOnboarded ?? false;
          }
        }
        return token;
      }
      if (user) {
        token.id = user.id;
        token.picture = user.image ?? token.picture;
        token.role = ((user as unknown) as { role: UserRole }).role ?? "job_seeker";
        token.locale = ((user as unknown) as { locale: string }).locale ?? "en";
        token.isEmailVerified = ((user as unknown) as { isEmailVerified?: boolean }).isEmailVerified ?? false;
        token.isOnboarded = ((user as unknown) as { isOnboarded?: boolean }).isOnboarded ?? false;
        token.permissionMode = ((user as unknown) as { permissionMode?: string }).permissionMode ?? "role_default";
        token.customPermissions = ((user as unknown) as { customPermissions?: Record<string, string[]> }).customPermissions ?? undefined;
        // Set JWT expiry based on rememberMe: 3 days if checked, 1 hour otherwise
        const rememberMe = ((user as unknown) as { rememberMe?: boolean }).rememberMe ?? false;
        const ttlSeconds = rememberMe ? 3 * 24 * 60 * 60 : 60 * 60;
        token.exp = Math.floor(Date.now() / 1000) + ttlSeconds;
        // Cache passwordChangedAt in token (seconds) for session invalidation checks
        const pca = ((user as unknown) as { passwordChangedAt?: Date }).passwordChangedAt;
        token.pca = pca ? Math.floor(new Date(pca).getTime() / 1000) : null;
      }

      // Token refresh path — verify the account is still active and the
      // password hasn't changed since this token was issued.
      //
      // SECURITY (W2-1): the DB re-check must run on the normal updateAge (5-min)
      // rotation window REGARDLESS of token.pca. Previously it only ran when a
      // password change was already known to postdate the token, so tokens
      // issued before any password change (or for users who never changed their
      // password) skipped the check entirely — letting deactivated users stay
      // logged in up to the 3-day max. We throttle to once per updateAge window
      // via token.lastDbCheck so this does not add a DB round-trip per request.
      if (token.id && !user) {
        const nowSec = Math.floor(Date.now() / 1000);
        const pcaSec = (token.pca as number | null) ?? 0;
        const lastCheck = (token.lastDbCheck as number | undefined) ?? (token.iat as number | undefined) ?? 0;
        // Immediate re-check if a known password change postdates this token,
        // otherwise re-check at most once per updateAge (5-min) window.
        const passwordChangedAfterToken = pcaSec > 0 && (token.iat as number) < pcaSec;
        const dueForPeriodicCheck = nowSec - lastCheck >= 5 * 60;

        if (passwordChangedAfterToken || dueForPeriodicCheck) {
          await connectDB();
          const dbUser = await User.findById(token.id)
            .select("passwordChangedAt isActive role permissionMode customPermissions")
            .lean() as {
              passwordChangedAt?: Date;
              isActive?: boolean;
              role?: UserRole;
              permissionMode?: string;
              customPermissions?: Record<string, string[]>;
            } | null;

          if (!dbUser?.isActive) return null;

          // Admin role/permission changes must reach live sessions — the token
          // caches these at login, so refresh them on the same periodic check
          // (previously an admin-converted employer got 403 on job posting
          // until they logged out and back in).
          token.role = dbUser.role ?? token.role;
          token.permissionMode = dbUser.permissionMode ?? "role_default";
          token.customPermissions = dbUser.customPermissions ?? undefined;

          if (dbUser.passwordChangedAt) {
            const changedAt = Math.floor(
              new Date(dbUser.passwordChangedAt).getTime() / 1000
            );
            if ((token.iat as number) < changedAt) return null;
            // Update cached value so future refreshes can skip the comparison
            token.pca = changedAt;
          }
          // Record when we last validated against the DB to throttle re-checks
          token.lastDbCheck = nowSec;
        }
      }
      // OAuth sign-in: create/find user in DB (LinkedIn OAuth — Firebase handles its own flow in authorize())
      if (account && account.provider !== "credentials" && account.provider !== "firebase") {
        await connectDB();
        let dbUser = await User.findOne({ email: token.email });
        const isNewUser = !dbUser;
        if (!dbUser) {
          dbUser = await User.create({
            email: token.email,
            name: token.name,
            avatar: token.picture,
            role: "job_seeker",
            isEmailVerified: true,
            authProvider: account.provider === "linkedin" ? "linkedin" : account.provider === "apple" ? "apple" : "google",
            linkedinSub: account.provider === "linkedin" ? account.providerAccountId : undefined,
            appleSub: account.provider === "apple" ? account.providerAccountId : undefined,
            locale: "en",
            lastLogin: new Date(),
          });
          // Re-host the provider avatar on our own storage so the URL never expires.
          const rehosted = await rehostExternalAvatar(token.picture as string | null | undefined);
          if (rehosted) {
            await User.updateOne({ _id: dbUser._id }, { $set: { avatar: rehosted } });
            dbUser.avatar = rehosted;
          }
        } else {
          // Update lastLogin for returning OAuth users
          await User.findByIdAndUpdate(dbUser._id, { lastLogin: new Date() });
          if (!dbUser.isActive) return null;
        }

        if (!isNewUser && account.provider === "linkedin" && !dbUser.linkedinSub) {
          // Link LinkedIn to existing account (auto-link — both sides verify email)
          const linkedAvatar = !dbUser.avatar && token.picture
            ? ((await rehostExternalAvatar(token.picture as string)) ?? (token.picture as string))
            : undefined;
          await User.findByIdAndUpdate(dbUser._id, {
            linkedinSub: account.providerAccountId,
            isEmailVerified: true,
            emailVerificationToken: undefined,
            ...(linkedAvatar ? { avatar: linkedAvatar } : {}),
          });
          dbUser.isEmailVerified = true;
        } else if (!isNewUser && account.provider === "linkedin" && !dbUser.isEmailVerified) {
          // Existing linked user still unverified — LinkedIn verified the email via OAuth
          await User.findByIdAndUpdate(dbUser._id, {
            isEmailVerified: true,
            emailVerificationToken: undefined,
          });
          dbUser.isEmailVerified = true;
        } else if (!isNewUser && account.provider === "apple" && !dbUser.appleSub) {
          // Link Apple to existing account (auto-link — both sides verify email)
          await User.findByIdAndUpdate(dbUser._id, {
            appleSub: account.providerAccountId,
            isEmailVerified: true,
            emailVerificationToken: undefined,
          });
          dbUser.isEmailVerified = true;
        } else if (!isNewUser && account.provider === "apple" && !dbUser.isEmailVerified) {
          await User.findByIdAndUpdate(dbUser._id, {
            isEmailVerified: true,
            emailVerificationToken: undefined,
          });
          dbUser.isEmailVerified = true;
        }

        // Ensure JobSeeker profile exists for OAuth users (needed for onboarding pre-fill)
        if (dbUser.role === "job_seeker") {
          const existingJS = await JobSeeker.findOne({ userId: dbUser._id }).select("isOnboarded").lean();
          if (!existingJS) {
            await JobSeeker.create({
              userId: dbUser._id,
              fullName: dbUser.name,
              isOnboarded: false,
              skills: [],
              experience: [],
              education: [],
              languages: [],
              certifications: [],
              preferredCountries: [],
              preferredRoles: [],
              preferredLocations: [],
            });
          }
          token.isOnboarded = existingJS?.isOnboarded ?? false;

          // Fetch additional LinkedIn profile data via REST API (headline, location, LinkedIn URL)
          if (account.provider === "linkedin" && account.access_token) {
            try {
              // Store encrypted access token for AI profile import during onboarding
              await User.findByIdAndUpdate(dbUser._id, {
                linkedinAccessToken: encrypt(account.access_token),
              });

              const extras = await fetchLinkedInExtras(account.access_token);
              const jsUpdate: Record<string, unknown> = {};
              if (extras.headline) jsUpdate.headline = extras.headline;
              if (extras.location) jsUpdate.currentLocation = extras.location;
              if (extras.linkedInUrl) {
                jsUpdate.socialLinks = [{ label: "LinkedIn", url: extras.linkedInUrl }];
              }
              if (Object.keys(jsUpdate).length > 0) {
                await JobSeeker.findOneAndUpdate(
                  { userId: dbUser._id },
                  { $set: jsUpdate },
                );
              }
            } catch (err) {
              logger.debug({ err }, "LinkedIn extras fetch failed — OIDC-only mode");
            }
          }
        }

        // ── H4a: 2FA challenge for OAuth sign-in ───────────────────────────────
        // SECURITY: 2FA was previously enforced ONLY in the credentials authorize()
        // flow. OAuth (Google/LinkedIn/Apple) issued a full session for any enrolled
        // admin/super_agent account without a TOTP challenge — a complete 2FA bypass.
        //
        // We now treat a returning OAuth user that has twoFactorEnabled as a
        // PARTIAL session: set token.pending2fa + pending2faUserId and skip
        // populating token.id/role/locale/etc. The session callback refuses to
        // surface identity fields while pending2fa is set, so the user is
        // effectively unauthenticated for everything except the dedicated
        // /api/auth/oauth-2fa/verify route + the verify-oauth-2fa page (which the
        // middleware whitelists). Newly-created OAuth users are job_seeker and can
        // never enroll in 2FA, so they fall through to the normal path below.
        //
        // NOTE: twoFactorSecretEnc is `select:false` — we gate on the canonical
        // `twoFactorEnabled` boolean (always loaded). The verify endpoint
        // re-fetches WITH the secret (+twoFactorSecretEnc) and fail-closes if
        // it's missing.
        const returningUserEnrolledIn2fa =
          !isNewUser && Boolean(dbUser.twoFactorEnabled);

        if (returningUserEnrolledIn2fa) {
          token.pending2fa = true;
          token.pending2faUserId = dbUser._id.toString();
          // Defer token.id/role/... population until TOTP is verified — see
          // POST /api/auth/oauth-2fa/verify which re-encodes the JWT cookie with
          // the full identity after a successful challenge.
          logActivity({
            actorId: dbUser._id.toString(),
            actorRole: dbUser.role,
            action: "login.2fa_required",
            resource: "auth",
            meta: { email: dbUser.email, provider: account.provider },
          });
          return token;
        }

        token.id = dbUser._id.toString();
        token.role = dbUser.role;
        token.locale = dbUser.locale;
        token.provider = account.provider;
        token.isEmailVerified = dbUser.isEmailVerified ?? true;
        token.permissionMode = dbUser.permissionMode ?? "role_default";
        token.customPermissions = dbUser.customPermissions ?? undefined;
        // Reflect the persisted (re-hosted) avatar in the live session image.
        token.picture = dbUser.avatar ?? token.picture;

        // Log OAuth login / registration
        logActivity({
          actorId: dbUser._id.toString(),
          actorRole: dbUser.role,
          action: isNewUser ? "register.oauth" : "login.success",
          resource: "auth",
          meta: { email: dbUser.email, provider: account.provider },
        });

        // Send welcome email for new OAuth users
        if (isNewUser && dbUser.email) {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
          const dashboardUrl = `${baseUrl}/en/job-seeker`;
          await sendEmail({
            to: dbUser.email,
            ...EmailTemplates.jobSeekerWelcome(dbUser.name || "there", dashboardUrl),
            source: "registration",
            category: "system",
          }).catch((err) =>
            logger.error({ err }, "[OAuth Registration] Failed to send welcome email")
          );
        }
      }

      // Resolve companyUserRole for employers — only when not already cached
      const resolvedRole = (token.role as string) ?? "";
      if (resolvedRole === "employer" && token.id && !token.companyId) {
        try {
          await connectDB();
          const emp = await Employer.findOne({ userId: token.id as string }).select("_id companyEmail").lean();
          if (emp) {
            const member = await ensureEmployerOwnerMembership({
              companyId: emp._id,
              userId: token.id as string,
              email: emp.companyEmail,
            });
            token.companyUserRole = member?.companyRole;
            token.companyId = String(emp._id);
          }
        } catch {
          // Non-critical — default to no company role
        }
      }

      return token;
    },
    async session({ session, token }) {
      // H4a: while the OAuth 2FA challenge is pending, expose the special flags
      // (so middleware/verify-route can see them) but deliberately do NOT set
      // session.user.id → withAuth treats the session as unauthenticated for
      // every data API, forcing the user to complete TOTP first.
      if (token.pending2fa) {
        (session.user as unknown as { pending2fa?: boolean }).pending2fa = true;
        (session.user as unknown as { pending2faUserId?: string }).pending2faUserId =
          token.pending2faUserId as string | undefined;
        session.user.id = "";
        return session;
      }
      if (session.user) {
        session.user.image = (token.picture as string | null | undefined) ?? session.user.image;
        session.user.id = token.id as string;
        (session.user as unknown as { role: UserRole }).role = token.role as UserRole;
        (session.user as unknown as { locale: string }).locale = token.locale as string;
        (session.user as unknown as { permissionMode: string }).permissionMode = (token.permissionMode as string) ?? "role_default";
        (session.user as unknown as { customPermissions?: Record<string, string[]> }).customPermissions = token.customPermissions as Record<string, string[]> | undefined;
        (session.user as unknown as { isOnboarded: boolean }).isOnboarded = (token.isOnboarded as boolean) ?? false;
        (session.user as unknown as { isEmailVerified: boolean }).isEmailVerified = (token.isEmailVerified as boolean) ?? false;
        (session.user as unknown as { provider?: string }).provider = (token.provider as string) ?? undefined;
        if (token.companyUserRole) {
          (session.user as unknown as { companyUserRole: CompanyRole }).companyUserRole = token.companyUserRole as CompanyRole;
        }
        if (token.companyId) {
          (session.user as unknown as { companyId: string }).companyId = token.companyId as string;
        }
      }
      return session;
    },
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
