import { notFound } from "next/navigation";

export default function DesignSystemLayout({ children }: { children: React.ReactNode }) {
  const enabled =
    process.env.NODE_ENV !== "production" || process.env.ENABLE_ADMIN_DEV_TOOLS === "true";
  if (!enabled) notFound();
  return <>{children}</>;
}
