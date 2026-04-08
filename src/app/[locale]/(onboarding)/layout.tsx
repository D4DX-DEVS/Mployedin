"use client";

import { SessionWrapper } from "@/components/shared/SessionWrapper";
import { CsrfProvider } from "@/components/shared/CsrfProvider";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionWrapper>
      <CsrfProvider>{children}</CsrfProvider>
    </SessionWrapper>
  );
}
