"use client";

import { useEffect } from "react";
import { installCsrfFetch } from "@/lib/security/csrf-client";

export function CsrfProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => { installCsrfFetch(); }, []);
  return <>{children}</>;
}
