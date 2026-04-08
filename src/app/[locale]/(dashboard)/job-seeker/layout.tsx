export default function JobSeekerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        {children}
      </div>
    </div>
  );
}
