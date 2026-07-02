import { PageHeaderSkeleton, FormFieldsSkeleton } from "@/components/ui/loading";

export default function ContactLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <PageHeaderSkeleton showButton={false} />
      <FormFieldsSkeleton fields={5} />
    </div>
  );
}
