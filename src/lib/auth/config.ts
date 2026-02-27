import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import LinkedIn from "next-auth/providers/linkedin";
import { z } from "zod";
import connectDB from "@/lib/db/mongoose";
import { User } from "@/models/User";
import type { UserRole } from "@/models/User";
import { logActivity } from "@/lib/audit/log";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

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
          isActive: true,
        }).select("+passwordHash");

        if (!user || !user.passwordHash) {
          // Log failed login — user not found or inactive
          logActivity({
            action: "login.failed",
            resource: "auth",
            meta: { email: parsed.data.email, reason: user ? "no_password" : "user_not_found" },
          });
          return null;
        }

        const valid = await user.comparePassword(parsed.data.password);
        if (!valid) {
          // Log failed login attempt
          logActivity({
            actorId: user._id.toString(),
            actorRole: user.role,
            action: "login.failed",
            resource: "auth",
            meta: { email: parsed.data.email, reason: "invalid_password" },
          });
          return null;
        }

        await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

        // Log successful login
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
        };
        } catch (err) {
          console.error("[auth] authorize error:", err);
          return null;
        }
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    LinkedIn({
      clientId: process.env.LINKEDIN_CLIENT_ID!,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/en/login",
    error: "/en/login",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.role = ((user as unknown) as { role: UserRole }).role ?? "job_seeker";
        token.locale = ((user as unknown) as { locale: string }).locale ?? "en";
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
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as unknown as { role: UserRole }).role = token.role as UserRole;
        (session.user as unknown as { locale: string }).locale = token.locale as string;
        (session.user as unknown as { permissionMode: string }).permissionMode = (token.permissionMode as string) ?? "role_default";
        (session.user as unknown as { customPermissions?: Record<string, string[]> }).customPermissions = token.customPermissions as Record<string, string[]> | undefined;
      }
      return session;
    },
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
