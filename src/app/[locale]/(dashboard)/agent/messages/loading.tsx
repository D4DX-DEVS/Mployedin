import { PageHeaderSkeleton, ChatSkeleton } from "@/components/ui/loading";

export default function MessagesLoading() {
  return (
    <div className="page-container animate-in fade-in duration-300">
      <PageHeaderSkeleton showButton={false} />
      <ChatSkeleton />
    </div>
  );
}
