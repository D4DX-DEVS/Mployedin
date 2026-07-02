import { ProfileDetailSkeleton } from "@/components/ui/loading";

export default function CandidatesDetailLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <ProfileDetailSkeleton />
    </div>
  );
}
