import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function userInitials(name?: string | null, email?: string | null): string {
  const value = (name ?? "").trim() || (email ?? "").trim().split("@")[0] || "U";
  const parts = value.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : value.slice(0, 2))
    .toUpperCase();
}

interface UserAvatarProps {
  name?: string | null;
  email?: string | null;
  src?: string | null;
  className?: string;
  fallbackClassName?: string;
  alt?: string;
}

/**
 * The shared identity treatment for people across the workspace.
 * A missing photo always resolves to initials, so tables, activity rows and
 * notifications keep the same visual weight without inventing a stock image.
 */
export function UserAvatar({
  name,
  email,
  src,
  className,
  fallbackClassName,
  alt,
}: UserAvatarProps) {
  return (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} alt={alt ?? name ?? email ?? "User"} className="object-cover" /> : null}
      <AvatarFallback className={cn("bg-primary/10 text-primary text-xs font-semibold", fallbackClassName)}>
        {userInitials(name, email)}
      </AvatarFallback>
    </Avatar>
  );
}
