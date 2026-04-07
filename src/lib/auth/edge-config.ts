/**
 * Edge-compatible NextAuth config.
 * ⚠️  NO imports from mongoose, bcrypt, mongoose models, or any Node.js built-ins.
 *     This file runs in the Edge Runtime (middleware).
 */
import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/types/user";

const edgeAuthConfig: NextAuthConfig = {
  /**
   * Providers are intentionally empty here — provider logic runs on the
   * Node.js runtime via the full config in lib/auth/config.ts.
   */
  providers: [],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/en/login",
    error: "/en/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.picture = user.image ?? token.picture;
        token.role = ((user as unknown) as { role: UserRole }).role ?? "job_seeker";
        token.locale = ((user as unknown) as { locale: string }).locale ?? "en";
        token.isEmailVerified = ((user as unknown) as { isEmailVerified?: boolean }).isEmailVerified ?? false;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.image = (token.picture as string | null | undefined) ?? session.user.image;
        session.user.id = token.id as string;
        ((session.user as unknown) as { role: UserRole }).role = token.role as UserRole;
        ((session.user as unknown) as { locale: string }).locale = token.locale as string;
        ((session.user as unknown) as { isEmailVerified: boolean }).isEmailVerified = token.isEmailVerified as boolean;
      }
      return session;
    },
  },
};

export const { auth } = NextAuth(edgeAuthConfig);
