import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MPLOYEDIN",
  description: "AI-Powered International Recruitment Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
