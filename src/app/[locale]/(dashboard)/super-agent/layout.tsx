import type { ReactNode } from "react";
import { SuperAgentShell } from "./SuperAgentShell";

export default function SuperAgentLayout({ children }: { children: ReactNode }) {
  return <SuperAgentShell>{children}</SuperAgentShell>;
}