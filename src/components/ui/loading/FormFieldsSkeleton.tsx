interface FormFieldsSkeletonProps {
  fields?: number;
  showTabs?: number;
}

export function FormFieldsSkeleton({ fields = 4, showTabs = 0 }: FormFieldsSkeletonProps) {
  return (
    <div>
      {showTabs > 0 && (
        <div className="flex gap-2 mb-6">
          {Array.from({ length: showTabs }).map((_, i) => (
            <div key={i} className="h-9 w-32 bg-muted/40 rounded-md animate-pulse" />
          ))}
        </div>
      )}
      <div className="rounded-lg border border-border bg-card space-y-6 panel-body">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-24 bg-muted/50 rounded-md animate-pulse" />
            <div className="h-10 w-full bg-muted/30 rounded-md animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
