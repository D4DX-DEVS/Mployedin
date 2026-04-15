"use client";

/**
 * Renders a relative date string using the **viewer's browser timezone**.
 * Must be a client component so it runs in the user's locale, not on the UTC server.
 *
 * Usage: <RelativeDate date={job.createdAt} />
 */

interface RelativeDateProps {
  /** ISO string or Date object of the date to display */
  date: string | Date;
  /** Optional prefix, e.g. "Posted" */
  prefix?: string;
}

function timeAgo(date: string | Date): string {
  const now = new Date();
  const posted = new Date(date);

  // Compare calendar dates at local midnight — timezone-aware
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const postedMidnight = new Date(
    posted.getFullYear(),
    posted.getMonth(),
    posted.getDate()
  );
  const days = Math.round(
    (nowMidnight.getTime() - postedMidnight.getTime()) / 86_400_000
  );

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  }
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? "s" : ""} ago`;
}

export default function RelativeDate({ date, prefix }: RelativeDateProps) {
  const label = timeAgo(date);
  return (
    <span suppressHydrationWarning>
      {prefix ? `${prefix} ${label}` : label}
    </span>
  );
}
