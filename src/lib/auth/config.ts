import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import LinkedIn from "next-auth/providers/linkedin";
import { z } from "zod";
import connectDB from "@/lib/db/mongoose";
import { User } from "@/models/User";
import type { UserRole } from "@/models/User";
import { CompanyUser } from "@/models/CompanyUser";
import { Employer } from "@/models/Employer";
import { logActivity } from "@/lib/audit/log";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import type { CompanyRole } from "@/models/CompanyUser";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
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

        // Reset failed attempts on successful login
        await User.findByIdAndUpdate(user._id, {
          lastLogin: new Date(),
          failedLoginAttempts: 0,
          lockUntil: null,
        });

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
        };
        } catch (err) {
          console.error("[auth] authorize error:", err);
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
          const isNewUser = !dbUser;
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

          logActivity({
            actorId: dbUser._id.toString(),
            actorRole: dbUser.role,
            action: isNewUser ? "register.oauth" : "login.success",
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
          };
        } catch (err) {
          console.error("[auth] firebase authorize error:", err);
          return null;
        }
      },
    }),
    LinkedIn({
      clientId: process.env.LINKEDIN_CLIENT_ID!,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 }, // 1 hour
  pages: {
    signIn: "/en/login",
    error: "/en/login",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.picture = user.image ?? token.picture;
        token.role = ((user as unknown) as { role: UserRole }).role ?? "job_seeker";
        token.locale = ((user as unknown) as { locale: string }).locale ?? "en";
        token.isEmailVerified = ((user as unknown) as { isEmailVerified?: boolean }).isEmailVerified ?? false;
        token.permissionMode = ((user as unknown) as { permissionMode?: string }).permissionMode ?? "role_default";
        token.customPermissions = ((user as unknown) as { customPermissions?: Record<string, string[]> }).customPermissions ?? undefined;
      }
      // OAuth sign-in: create/find user in DB
      if (account && account.provider !== "credentials") {
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
            locale: "en",
          });
        }
        token.id = dbUser._id.toString();
        token.role = dbUser.role;
        token.locale = dbUser.locale;
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
      }

      // Resolve companyUserRole for employers
      const resolvedRole = (token.role as string) ?? "";
      if (resolvedRole === "employer" && token.id) {
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
