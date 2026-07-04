import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Calendar, Video, MapPin, Monitor, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface UpcomingInterview {
  _id: string;
  type: "video" | "offline" | "hybrid";
  scheduledAt: string;
  duration: number;
  meetLink?: string;
  location?: string;
  candidateResponse: string;
  jobId: { _id: string; title: string } | null;
  employerId: { _id: string; companyName: string } | null;
}

interface UpcomingInterviewsProps {
  interviews: UpcomingInterview[];
  locale: string;
}

const typeIcons = {
  video: Video,
  offline: MapPin,
  hybrid: Monitor,
};

const typeLabels = {
  video: "Video Call",
  offline: "In Person",
  hybrid: "Hybrid",
};

export async function UpcomingInterviews({
  interviews,
  locale,
}: UpcomingInterviewsProps) {
  const t = await getTranslations("upcomingInterviews");

  if (interviews.length === 0) {
    return (
      <div className="card-base p-6 text-center">
        <Calendar className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <p className="mt-2 text-sm text-muted-foreground">
          {t("noUpcomingInterviews")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("keepApplying")}
        </p>
      </div>
    );
  }

  return (
    <div className="card-base p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("upcomingInterviews")}</h3>
        <Link
          href={`/${locale}/job-seeker/interviews`}
          className="text-xs font-medium text-primary hover:underline"
        >
          {t("viewAll")}
        </Link>
      </div>

      <div className="space-y-3">
        {interviews.map((interview) => {
          const TypeIcon = typeIcons[interview.type] ?? Calendar;
          const date = new Date(interview.scheduledAt);

          return (
            <div
              key={interview._id}
              className="rounded-lg border border-border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {interview.jobId?.title ?? "Interview"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {interview.employerId?.companyName ?? "Company"}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {date.toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                      {" at "}
                      {date.toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      <TypeIcon className="mr-1 h-2.5 w-2.5" />
                      {typeLabels[interview.type]}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {interview.duration} min
                    </span>
                  </div>
                </div>

                {interview.type === "video" && interview.meetLink && (
                  <a
                    href={interview.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button size="sm" className="h-8 text-xs">
                      <ExternalLink className="mr-1 h-3 w-3" />
                      Join
                    </Button>
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
