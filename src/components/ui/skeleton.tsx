import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  role = "presentation",
  "aria-hidden": ariaHidden = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role={role}
      aria-hidden={ariaHidden}
      className={cn("rounded-md skeleton-shimmer pointer-events-none select-none", className)}
      {...props}
    />
  );
}
