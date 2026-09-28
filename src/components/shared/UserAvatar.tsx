import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function userInitials(name?: string | null, email?: string | null): string {
  const value = (name ?? "").trim() || (email ?? "").trim().split("@")[0] || "U";
  const parts = value.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : value.slice(0, 2))
    .toUpperCase();
}

// The notification list's tints: light surface, 600 text. A record keeps its
// colour everywhere because the tone is picked from its name, not its position.
const AVATAR_TONES = [
  "bg-sky-50 text-sky-600",
  "bg-emerald-50 text-emerald-600",
  "bg-violet-50 text-violet-600",
  "bg-amber-50 text-amber-600",
  "bg-fuchsia-50 text-fuchsia-600",
] as const;

export function avatarTone(seed?: string | null): string {
  const value = (seed ?? "").trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

interface UserAvatarProps {
  name?: string | null;
  email?: string | null;
  src?: string | null;
  className?: string;
  fallbackClassName?: string;
  /** Tint the initials from the name (list rows); default is the primary tint. */
  colorful?: boolean;
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
  colorful = false,
  alt,
}: UserAvatarProps) {
  return (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} alt={alt ?? name ?? email ?? "User"} className="object-cover" /> : null}
      <AvatarFallback className={cn("bg-primary/10 text-primary text-xs font-semibold", colorful && avatarTone(name || email), fallbackClassName)}>
        {userInitials(name, email)}
      </AvatarFallback>
    </Avatar>
  );
}
