"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  User, MapPin, Globe, Briefcase, GraduationCap, Award,
  Link2, Upload, Sparkles, BrainCircuit,
  CheckCircle2, Circle, Plus, Target, Zap,
  FileText, TrendingUp, ChevronRight, Languages as LanguagesIcon,
  UserCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";

interface Skill { name: string; level: string; yearsOfExperience: number; }
interface Experience { jobTitle: string; company: string; location: string; from: string; to: string; current: boolean; description: string; }
interface Education { degree: string; field: string; institution: string; country: string; from: string; to: string; }
interface Language { language: string; level: string; }

interface ProfileData {
  userId: string;
  nationality: string;
  dateOfBirth: string;
  currentLocation: string;
  summary: string;
  skills: Skill[];
  experience: Experience[];
  education: Education[];
  languages: Language[];
  certifications: string[];
  linkedin: string;
  portfolio: string;
  profileCompleteness: number;
  cvFileUrl: string;
  cvExtractedByAI: boolean;
  badges: string[];
}

type ChecklistStep = {
  id: string;
  label: string;
  bonus: string;
  done: boolean;
  href: string;
  icon: React.ElementType;
};

function buildChecklist(profile: ProfileData | null): ChecklistStep[] {
  return [
    { id: "cv",          label: "Upload Resume",      bonus: "+30%", done: !!profile?.cvFileUrl,                      href: "./cv",                    icon: FileText      },
    { id: "skills",      label: "Add Skills",         bonus: "+20%", done: (profile?.skills?.length ?? 0) > 0,        href: "./cv",                    icon: Award         },
    { id: "experience",  label: "Add Experience",     bonus: "+15%", done: (profile?.experience?.length ?? 0) > 0,    href: "./cv",                    icon: Briefcase     },
    { id: "education",   label: "Add Education",      bonus: "+10%", done: (profile?.education?.length ?? 0) > 0,     href: "./cv",                    icon: GraduationCap },
    { id: "personal",    label: "Personal Details",   bonus: "+10%", done: !!(profile?.dateOfBirth || profile?.nationality), href: "./profile/personal-details", icon: UserCircle    },
    { id: "preferences", label: "Set Job Preferences",bonus: "+15%", done: false,                                      href: "./preferences",           icon: Target        },
  ];
}

export default function JobSeekerProfilePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "My Profile · MPLOYEDIN";
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const res = await fetch("/api/job-seeker/profile");
      if (res.ok) setProfile(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  const name      = session?.user?.name  ?? "Job Seeker";
  const email     = session?.user?.email ?? "";
  const userImage = session?.user?.image ?? "";
  const initials  = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card-base p-5 animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-16 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  const completeness    = profile?.profileCompleteness ?? 0;
  const checklist       = buildChecklist(profile);
  const missingSteps    = checklist.filter((s) => !s.done);
  const doneSteps       = checklist.filter((s) => s.done);
  const potentialBoost  = missingSteps.reduce((acc, s) => acc + parseInt(s.bonus), 0);

  const completenessColor     = completeness >= 80 ? "text-emerald-600" : completeness >= 50 ? "text-amber-500" : "text-rose-500";
  const completenessRingColor = completeness >= 80 ? "stroke-emerald-500" : completeness >= 50 ? "stroke-amber-500" : "stroke-rose-500";

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">

      {/* ── Page Header ────────────────────────────────────────────────── */}
      <PageHeader
        title="My Profile"
        description="Build your career profile and get matched with top opportunities"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("./cv")}>
              <Upload className="w-4 h-4 me-1.5" />
              <span className="hidden sm:inline">Upload</span> CV
            </Button>
            <Button size="sm" onClick={() => router.push("./settings")}>
              <TrendingUp className="w-4 h-4 me-1.5" />
              <span className="hidden sm:inline">Improve</span> Profile
            </Button>
          </div>
        }
      />

      {/* ── Profile Header Card ─────────────────────────────────────────── */}
      <div className="card-base p-5 sm:p-6">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="relative shrink-0">
            <Avatar className="w-16 h-16 sm:w-20 sm:h-20 ring-4 ring-background shadow-sm">
              <AvatarImage src={userImage} />
              <AvatarFallback className="bg-primary text-primary-foreground font-bold text-xl sm:text-2xl">
                {initials}
              </AvatarFallback>
            </Avatar>
            {completeness >= 80 && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-background">
                <CheckCircle2 className="w-3 h-3 text-white" />
              </span>
            )}
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-bold">{name}</h2>
              {profile?.badges?.map((b) => (
                <Badge key={b} variant="secondary" className="text-xs gap-1">
                  <Award className="w-3 h-3" />{b}
                </Badge>
              ))}
              {profile?.cvExtractedByAI && (
                <Badge className="bg-violet-100 text-violet-700 border-violet-200 gap-1 text-xs">
                  <Sparkles className="w-3 h-3" /> AI extracted
                </Badge>
              )}
            </div>

            {profile?.summary ? (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{profile.summary}</p>
            ) : (
              <p className="text-sm text-muted-foreground/70 mt-1 italic">No summary yet — upload your CV to auto-generate one</p>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-2">
              {email && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <User className="w-3 h-3" /> {email}
                </span>
              )}
              {profile?.currentLocation && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {profile.currentLocation}
                </span>
              )}
              {profile?.nationality && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Globe className="w-3 h-3" /> {profile.nationality}
                </span>
              )}
            </div>
          </div>

          {/* Completion ring — desktop only */}
          <div className="hidden sm:flex shrink-0 flex-col items-center gap-2">
            <div className="relative w-[72px] h-[72px]">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
                <circle cx="36" cy="36" r="30" fill="none" stroke="currentColor"
                  strokeWidth="5" className="text-muted/20" />
                <circle cx="36" cy="36" r="30" fill="none" strokeWidth="5"
                  strokeDasharray={`${2 * Math.PI * 30}`}
                  strokeDashoffset={`${2 * Math.PI * 30 * (1 - completeness / 100)}`}
                  strokeLinecap="round"
                  className={cn("transition-all duration-700", completenessRingColor)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-px">
                <span className={cn("text-base font-bold leading-none", completenessColor)}>{completeness}%</span>
                <span className="text-[9px] text-muted-foreground leading-none">complete</span>
              </div>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {doneSteps.length}/{checklist.length} steps done
            </span>
          </div>
        </div>

        {/* Mobile: compact progress bar */}
        <div className="sm:hidden mt-4 pt-4 border-t border-border/50">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Profile completion</span>
            <span className={cn("font-semibold", completenessColor)}>{completeness}% · {doneSteps.length}/{checklist.length} steps</span>
          </div>
          <Progress value={completeness} className="h-1.5" />
        </div>
      </div>

      {/* ── AI Insight Card ───────────────────────────────────────────── */}
      {completeness < 80 && (
        <div className="card-base p-5 sm:p-6 border-violet-200 dark:border-violet-800/40"
          style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(270 60% 98%) 100%)" }}>
          <div className="flex items-start gap-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/50">
              <BrainCircuit className="w-4.5 h-4.5 text-violet-600" style={{ width: "18px", height: "18px" }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-semibold">AI Career Insight</span>
                <span className="inline-flex items-center rounded-full bg-violet-600 px-1.5 py-px text-[10px] font-bold text-white tracking-wide">
                  SMART
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Complete your profile to boost your job match score by{" "}
                <span className={cn("font-bold", completeness < 50 ? "text-rose-600" : "text-amber-600")}>+{potentialBoost}%</span>.
                {" "}Profiles with a resume get <span className="font-semibold text-foreground">3× more interviews</span>.
              </p>
              {missingSteps.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {missingSteps.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => router.push(s.href)}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3 text-muted-foreground" />
                      {s.label}
                      <span className="text-emerald-600 font-semibold">{s.bonus}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Setup Checklist ───────────────────────────────────────────── */}
      {completeness < 100 && (
        <div className="card-base p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold">Profile Setup</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {doneSteps.length} of {checklist.length} complete
            </span>
          </div>

          <div className="space-y-1">
            {checklist.map((step, idx) => (
              <button
                key={step.id}
                onClick={() => !step.done && router.push(step.href)}
                disabled={step.done}
                className={cn(
                  "group w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                  step.done ? "opacity-60 cursor-default" : "hover:bg-muted/60 cursor-pointer",
                  idx === 0 && !step.done && "bg-primary/5 hover:bg-primary/10"
                )}
              >
                {step.done
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  : <Circle className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                }
                <div className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                  step.done ? "bg-emerald-100 dark:bg-emerald-950/30" : idx === 0 ? "bg-primary/10" : "bg-muted"
                )}>
                  <step.icon className={cn("w-3.5 h-3.5", step.done ? "text-emerald-600" : idx === 0 ? "text-primary" : "text-muted-foreground")} />
                </div>
                <span className={cn(
                  "flex-1 text-sm font-medium",
                  step.done ? "line-through text-muted-foreground" : "text-foreground"
                )}>
                  {step.label}
                </span>
                <span className={cn(
                  "text-xs font-semibold tabular-nums",
                  step.done ? "text-emerald-500" : idx === 0 ? "text-primary" : "text-amber-500"
                )}>
                  {step.done ? "✓ Done" : step.bonus}
                </span>
                {!step.done && (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 group-hover:text-muted-foreground transition-colors" />
                )}
              </button>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-border/50">
            <Progress value={completeness} className="h-1.5" />
            <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
              <span>Overall progress</span>
              <span>{completeness}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Profile Sections ───────────────────────────────────────────── */}
      <div className="space-y-3">

        <SectionCard icon={User} title="About" onAdd={() => router.push("./settings")} isEmpty={!profile?.summary} emptyLabel="Add a professional summary">
          {profile?.summary && <p className="text-sm text-muted-foreground leading-relaxed">{profile.summary}</p>}
        </SectionCard>

        <SectionCard icon={Briefcase} title="Experience" onAdd={() => router.push("./cv")} isEmpty={(profile?.experience?.length ?? 0) === 0} emptyLabel="Add work experience">
          {(profile?.experience?.length ?? 0) > 0 && (
            <div className="space-y-4">
              {profile!.experience.map((exp, i) => (
                <div key={i} className={cn("", i < profile!.experience.length - 1 && "pb-4 border-b border-border/40")}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{exp.jobTitle}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{exp.company}{exp.location && ` · ${exp.location}`}</p>
                      <p className="text-xs text-muted-foreground">{exp.from} – {exp.current ? "Present" : exp.to}</p>
                    </div>
                    {exp.current && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs shrink-0">Current</Badge>}
                  </div>
                  {exp.description && <p className="text-xs text-muted-foreground mt-2 leading-relaxed line-clamp-3">{exp.description}</p>}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard icon={Award} title="Skills" onAdd={() => router.push("./cv")} isEmpty={(profile?.skills?.length ?? 0) === 0} emptyLabel="Add skills">
          {(profile?.skills?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              {profile!.skills.map((s, i) => (
                <Badge key={i} variant="secondary" className="px-3 py-1 text-sm">
                  {s.name}
                  {s.yearsOfExperience > 0 && <span className="ms-1.5 text-xs text-muted-foreground">{s.yearsOfExperience}y</span>}
                </Badge>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard icon={GraduationCap} title="Education" onAdd={() => router.push("./cv")} isEmpty={(profile?.education?.length ?? 0) === 0} emptyLabel="Add education">
          {(profile?.education?.length ?? 0) > 0 && (
            <div className="space-y-3">
              {profile!.education.map((edu, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                    <GraduationCap className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{edu.degree} in {edu.field}</p>
                    <p className="text-xs text-muted-foreground">{edu.institution}{edu.country && ` · ${edu.country}`}</p>
                    {edu.from && <p className="text-xs text-muted-foreground">{edu.from} – {edu.to}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Languages & Links — only when data exists */}
        {((profile?.languages?.length ?? 0) > 0 || (profile?.certifications?.length ?? 0) > 0 || profile?.linkedin || profile?.portfolio) && (
          <SectionCard icon={LanguagesIcon} title="Languages & Links" isEmpty={false}>
            <div className="space-y-4">
              {(profile?.languages?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Languages</p>
                  <div className="flex flex-wrap gap-2">
                    {profile!.languages.map((l, i) => (
                      <Badge key={i} variant="outline" className="capitalize text-xs">{l.language} · {l.level}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {(profile?.certifications?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Certifications</p>
                  <div className="flex flex-wrap gap-2">
                    {profile!.certifications.map((c, i) => (
                      <Badge key={i} variant="secondary" className="gap-1 text-xs"><Award className="w-3 h-3" />{c}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {(profile?.linkedin || profile?.portfolio) && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Links</p>
                  <div className="flex flex-wrap gap-4">
                    {profile?.linkedin && (
                      <a href={profile.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                        <Link2 className="w-3.5 h-3.5" /> LinkedIn
                      </a>
                    )}
                    {profile?.portfolio && (
                      <a href={profile.portfolio} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                        <Link2 className="w-3.5 h-3.5" /> Portfolio
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        )}
      </div>

      {/* ── Quick Actions ──────────────────────────────────────────────── */}
      <div className="card-base p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold">Quick Actions</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <QuickAction icon={FileText}  label="Upload Resume"     description="Auto-fill profile with AI"       onClick={() => router.push("./cv")}          primary />
          <QuickAction icon={Award}     label="Add Skills"        description="Improve your match score"        onClick={() => router.push("./cv")}                  />
          <QuickAction icon={Target}    label="Job Preferences"   description="Get better recommendations"      onClick={() => router.push("./preferences")}         />
        </div>
      </div>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon, title, children, onAdd, isEmpty, emptyLabel,
}: {
  icon: React.ElementType;
  title: string;
  children?: React.ReactNode;
  onAdd?: () => void;
  isEmpty: boolean;
  emptyLabel?: string;
}) {
  return (
    <div className="card-base p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-md hover:bg-muted"
          >
            <Plus className="w-3.5 h-3.5" />
            {isEmpty ? "Add" : "Update"}
          </button>
        )}
      </div>

      {/* Content or empty state */}
      {isEmpty ? (
        <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-4 py-3.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted shrink-0">
            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{emptyLabel}</p>
            {onAdd && (
              <button onClick={onAdd} className="text-xs text-primary hover:underline mt-0.5 block">
                Upload CV to auto-fill →
              </button>
            )}
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function QuickAction({
  icon: Icon, label, description, onClick, primary,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all hover:shadow-sm w-full",
        primary ? "border-primary/30 bg-primary/5 hover:bg-primary/10" : "border-border/60 hover:bg-muted/40"
      )}
    >
      <div className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
        primary ? "bg-primary/15 group-hover:bg-primary/20" : "bg-muted group-hover:bg-muted/70"
      )}>
        <Icon className={cn("w-4 h-4", primary ? "text-primary" : "text-muted-foreground")} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 ms-auto group-hover:text-muted-foreground transition-colors" />
    </button>
  );
}


