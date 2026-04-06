import { FileText, Calendar, CheckCircle2, Star, Clock } from "lucide-react";

interface ActivityItem {
  type: "application" | "notification";
  status?: string;
  jobTitle?: string;
  companyName?: string;
  notificationType?: string;
  title?: string;
  body?: string;
  date: string;
}

interface RecentActivityProps {
  items: ActivityItem[];
}

const statusLabels: Record<string, string> = {
  applied: "Applied to",
  shortlisted: "Shortlisted for",
  interview_scheduled: "Interview scheduled for",
  selected: "Selected for",
  offer: "Received offer for",
  hired: "Hired for",
  rejected: "Application updated for",
  withdrawn: "Withdrew from",
};

const statusIcons: Record<string, typeof FileText> = {
  applied: FileText,
  shortlisted: Star,
  interview_scheduled: Calendar,
  selected: CheckCircle2,
  offer: CheckCircle2,
  hired: CheckCircle2,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function RecentActivity({ items }: RecentActivityProps) {
  if (items.length === 0) {
    return (
      <div className="card-base p-6 text-center">
        <Clock className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <p className="mt-2 text-sm text-muted-foreground">
          No recent activity
        </p>
        <p className="text-xs text-muted-foreground">
          Start applying to jobs to see your activity here
        </p>
      </div>
    );
  }

  return (
    <div className="card-base p-6">
      <h3 className="mb-4 text-sm font-semibold">Recent Activity</h3>
      <div className="space-y-3">
        {items.map((item, i) => {
          if (item.type === "application") {
            const Icon =
              statusIcons[item.status ?? "applied"] ?? FileText;
            const label =
              statusLabels[item.status ?? "applied"] ?? "Updated";

            return (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-primary/10 p-1.5">
                  <Icon className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">
                    <span className="text-muted-foreground">{label}</span>{" "}
                    <span className="font-medium">{item.jobTitle}</span>{" "}
                    <span className="text-muted-foreground">at</span>{" "}
                    <span className="font-medium">{item.companyName}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {timeAgo(item.date)}
                  </p>
                </div>
              </div>
            );
          }

          return (
            <div key={i} className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-muted p-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {timeAgo(item.date)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
