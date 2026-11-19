"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useEmployerSignupOpen } from "@/hooks/useEmployerOnboarding";

/** Where a public "For employers" / "Start hiring" call to action goes right now. */
export function employerEntryHref(locale: string, signupOpen: boolean): string {
  return signupOpen ? `/${locale}/employer-register` : `/${locale}/contact`;
}

/** The employer-entry href for client components (follows the admin switch). */
export function useEmployerEntryHref(locale: string): string {
  return employerEntryHref(locale, useEmployerSignupOpen());
}

type EmployerEntryLinkProps = Omit<ComponentProps<typeof Link>, "href"> & { locale: string };

/**
 * Public employer call to action. While the admin has public employer sign-up
 * off (Admin → Settings → Employer onboarding), it leads to the contact page,
 * where our team sets the account up, instead of the self-service sign-up.
 */
export function EmployerEntryLink({ locale, ...props }: EmployerEntryLinkProps) {
  return <Link href={useEmployerEntryHref(locale)} {...props} />;
}
