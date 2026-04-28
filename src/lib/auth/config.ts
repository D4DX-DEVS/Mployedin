import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import LinkedIn from "next-auth/providers/linkedin";
import { z } from "zod";
import connectDB from "@/lib/db/mongoose";
import { User } from "@/models/User";
import type { UserRole } from "@/models/User";
import { CompanyUser } from "@/models/CompanyUser";
import { Employer } from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import { logActivity } from "@/lib/audit/log";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import type { CompanyRole } from "@/models/CompanyUser";
import logger from "@/lib/logger";
import { fetchLinkedInExtras } from "@/lib/auth/linkedin-profile";
import { encrypt } from "@/lib/security/encryption";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  rememberMe: z.string().optional(),
});

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      async authorize(credentials) {
        try {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        await connectDB();
        const user = await User.findOne({
          email: parsed.data.email.toLowerCase(),
        }).select("+passwordHash +failedLoginAttempts +lockUntil");

        if (!user || !user.passwordHash) {
          logActivity({
            action: "login.failed",
            resource: "auth",
            meta: { email: parsed.data.email, reason: user ? "no_password" : "user_not_found" },
          });
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
          return null;
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
          // Increment failed attempts
          const attempts = (user.failedLoginAttempts || 0) + 1;
          const update: Record<string, unknown> = { failedLoginAttempts: attempts };
          if (attempts >= MAX_FAILED_ATTEMPTS) {
            update.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
          }
          await User.findByIdAndUpdate(user._id, update);

          logActivity({
            actorId: user._id.toString(),
            actorRole: user.role,
            action: "login.failed",
            resource: "auth",
            meta: {
              email: parsed.data.email,
              reason: attempts >= MAX_FAILED_ATTEMPTS ? "account_locked" : "invalid_password",
              failedAttempts: attempts,
            },
          });
          return null;
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
            });
            // Create empty JobSeeker profile for new social-login users
            await JobSeeker.create({
              userId: dbUser._id,
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
            const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
            const dashboardUrl = `${baseUrl}/en/job-seeker/dashboard`;
            await sendEmail({
              to: email,
              ...EmailTemplates.jobSeekerWelcome(dbUser.name || "there", dashboardUrl),
              source: "registration",
              category: "system",
            }).catch((err) =>
              console.error("[Firebase Registration] Failed to send welcome email:", err)
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
              update.avatar = providerAvatar;
            }

            if (Object.keys(update).length > 0) {
              dbUser = await User.findByIdAndUpdate(dbUser._id, update, { new: true }) ?? dbUser;
            }
          }

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
      // Client called update() — merge the new values into the token
      if (trigger === "update" && updateData) {
        const data = updateData as Record<string, unknown>;
        if (data.isOnboarded !== undefined) token.isOnboarded = data.isOnboarded;
        if (data.role !== undefined) token.role = data.role;
        if (data.locale !== undefined) token.locale = data.locale;
        if (typeof data.name === "string") token.name = data.name;
        if (data.image !== undefined) token.picture = data.image as string | null;
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

      // Token refresh path — verify password hasn't changed since this token was issued.
      // Only hit DB when token.pca is set (password was changed at least once) or
      // periodically (every updateAge cycle — controlled by NextAuth).
      if (token.id && !user) {
        // Quick JWT-only check: if passwordChangedAt (cached as token.pca) is
        // still older than iat, skip the DB round-trip entirely.
        const pcaSec = (token.pca as number | null) ?? 0;
        const needsDbCheck = pcaSec > 0 && (token.iat as number) < pcaSec;

        if (needsDbCheck) {
          await connectDB();
          const dbUser = await User.findById(token.id)
            .select("passwordChangedAt isActive")
            .lean() as { passwordChangedAt?: Date; isActive?: boolean } | null;

          if (!dbUser?.isActive) return null;

          if (dbUser.passwordChangedAt) {
            const changedAt = Math.floor(
              new Date(dbUser.passwordChangedAt).getTime() / 1000
            );
            if ((token.iat as number) < changedAt) return null;
            // Update cached value so future refreshes can skip DB
            token.pca = changedAt;
          }
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
            authProvider: account.provider === "linkedin" ? "linkedin" : "google",
            linkedinSub: account.provider === "linkedin" ? account.providerAccountId : undefined,
            locale: "en",
          });
        } else if (account.provider === "linkedin" && !dbUser.linkedinSub) {
          // Link LinkedIn to existing account (auto-link — both sides verify email)
          await User.findByIdAndUpdate(dbUser._id, {
            linkedinSub: account.providerAccountId,
            isEmailVerified: true,
            emailVerificationToken: undefined,
            ...(!dbUser.avatar && token.picture ? { avatar: token.picture } : {}),
          });
          dbUser.isEmailVerified = true;
        } else if (account.provider === "linkedin" && !dbUser.isEmailVerified) {
          // Existing linked user still unverified — LinkedIn verified the email via OAuth
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

        token.id = dbUser._id.toString();
        token.role = dbUser.role;
        token.locale = dbUser.locale;
        token.provider = account.provider;
        token.isEmailVerified = dbUser.isEmailVerified ?? true;
        token.permissionMode = dbUser.permissionMode ?? "role_default";
        token.customPermissions = dbUser.customPermissions ?? undefined;

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
          const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
          const dashboardUrl = `${baseUrl}/en/job-seeker/dashboard`;
          await sendEmail({
            to: dbUser.email,
            ...EmailTemplates.jobSeekerWelcome(dbUser.name || "there", dashboardUrl),
            source: "registration",
            category: "system",
          }).catch((err) =>
            console.error("[OAuth Registration] Failed to send welcome email:", err)
          );
        }
      }

      // Resolve companyUserRole for employers — only when not already cached
      const resolvedRole = (token.role as string) ?? "";
      if (resolvedRole === "employer" && token.id && !token.companyId) {
        try {
          await connectDB();
          const emp = await Employer.findOne({ userId: token.id as string }).select("_id").lean();
          if (emp) {
            const member = await CompanyUser.findOne({
              companyId: emp._id,
              userId: token.id as string,
              status: "active",
            }).select("companyRole").lean();
            token.companyUserRole = member?.companyRole ?? "owner";
            token.companyId = String(emp._id);
          }
        } catch {
          // Non-critical — default to no company role
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.image = (token.picture as string | null | undefined) ?? session.user.image;
        session.user.id = token.id as string;
        (session.user as unknown as { role: UserRole }).role = token.role as UserRole;
        (session.user as unknown as { locale: string }).locale = token.locale as string;
        (session.user as unknown as { permissionMode: string }).permissionMode = (token.permissionMode as string) ?? "role_default";
        (session.user as unknown as { customPermissions?: Record<string, string[]> }).customPermissions = token.customPermissions as Record<string, string[]> | undefined;
        (session.user as unknown as { isOnboarded: boolean }).isOnboarded = (token.isOnboarded as boolean) ?? false;
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
