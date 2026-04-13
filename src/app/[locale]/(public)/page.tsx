import LandingPage from "@/components/features/public/LandingPage";

// Landing page is mostly static — revalidate once per hour
export const revalidate = 3600;

export default function PublicHomePage() {
  return <LandingPage />;
}
