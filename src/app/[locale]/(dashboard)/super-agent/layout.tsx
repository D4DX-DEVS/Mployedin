import type { ReactNode } from "react";

export default function SuperAgentLayout({ children }: { children: ReactNode }) {
  return <div className="super-agent-legacy-surface">{children}</div>;
}