"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  User, MapPin, Globe, Briefcase, GraduationCap, Award,
  Languages, Link2, Edit2, CheckCircle, Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageHeader } from "@/components/shared/PageHeader";

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
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const name = session?.user?.name ?? "Job Seeker";
  const email = session?.user?.email ?? "";
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="h-32 bg-muted rounded-xl" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  const completeness = profile?.profileCompleteness ?? 0;

  const completenessColor =
    completeness >= 80 ? "text-emerald-600" :
    completeness >= 50 ? "text-amber-600" :
    "text-destructive";

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4 sm:space-y-6">
      <PageHeader
        title="My Profile"
        description="Manage your professional profile and improve your match score"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("./cv")}>
              <Upload className="w-4 h-4 me-2" /> Re-upload CV
            </Button>
            <Button size="sm">
              <Edit2 className="w-4 h-4 me-2" /> Edit Profile
            </Button>
          </div>
        }
      />

      {/* Profile header card */}
      <div className="card-base">
        <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
          <Avatar className="w-20 h-20 text-xl">
            <AvatarImage src={session?.user?.image ?? ""} />
            <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold truncate">{name}</h2>
              {profile?.badges?.map((b) => (
                <Badge key={b} variant="secondary" className="text-xs">
                  <Award className="w-3 h-3 me-1" />{b}
                </Badge>
              ))}
            </div>
            {profile?.summary && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{profile.summary}</p>
            )}
            <div className="flex items-center gap-4 mt-2 flex-wrap">
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

          <div className="sm:text-end shrink-0 w-40">
            <div className={`text-2xl font-bold ${completenessColor}`}>{completeness}%</div>
            <p className="text-xs text-muted-foreground mb-2">Profile complete</p>
            <Progress value={completeness} className="h-2" />
            {completeness < 80 && (
              <p className="text-xs text-muted-foreground mt-1">
                Add more info to boost your matches
              </p>
            )}
          </div>
        </div>

        {/* AI extraction badge */}
        {profile?.cvExtractedByAI && (
          <div className="mt-4 pt-4 border-t flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            Profile data extracted from CV by AI · 
            <Button variant="link" size="sm" className="text-xs h-auto p-0" onClick={() => router.push("./cv")}>
              Update CV
            </Button>
          </div>
        )}
      </div>

      {/* No profile nudge */}
      {!profile && (
        <div className="card-base text-center py-12 space-y-3">
          <Upload className="w-12 h-12 text-muted-foreground mx-auto" />
          <h3 className="font-semibold">No profile data yet</h3>
          <p className="text-sm text-muted-foreground">Upload your CV and let AI build your profile automatically</p>
          <Button onClick={() => router.push("./cv")}>
            Upload CV Now
          </Button>
        </div>
      )}

      {profile && (
        <Tabs defaultValue="experience">
          <TabsList>
            <TabsTrigger value="experience">
              <Briefcase className="w-4 h-4 me-2" />Experience
            </TabsTrigger>
            <TabsTrigger value="education">
              <GraduationCap className="w-4 h-4 me-2" />Education
            </TabsTrigger>
            <TabsTrigger value="skills">
              <Award className="w-4 h-4 me-2" />Skills
            </TabsTrigger>
            <TabsTrigger value="other">
              <Languages className="w-4 h-4 me-2" />Other
            </TabsTrigger>
          </TabsList>

          {/* Experience */}
          <TabsContent value="experience" className="mt-4">
            {profile.experience?.length ? (
              <div className="space-y-4">
                {profile.experience.map((exp, i) => (
                  <div key={i} className="card-base">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{exp.jobTitle}</p>
                        <p className="text-sm text-muted-foreground">{exp.company} · {exp.location}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {exp.from} – {exp.current ? "Present" : exp.to}
                        </p>
                      </div>
                      {exp.current && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Current</Badge>
                      )}
                    </div>
                    {exp.description && (
                      <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{exp.description}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Briefcase} label="No experience added" action={{ label: "Upload CV", href: "./cv" }} router={router} />
            )}
          </TabsContent>

          {/* Education */}
          <TabsContent value="education" className="mt-4">
            {profile.education?.length ? (
              <div className="space-y-3">
                {profile.education.map((edu, i) => (
                  <div key={i} className="card-base flex items-center gap-4">
                    <GraduationCap className="w-8 h-8 text-primary flex-shrink-0" />
                    <div>
                      <p className="font-medium">{edu.degree} in {edu.field}</p>
                      <p className="text-sm text-muted-foreground">{edu.institution} · {edu.country}</p>
                      {edu.from && <p className="text-xs text-muted-foreground">{edu.from} – {edu.to}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={GraduationCap} label="No education added" action={{ label: "Upload CV", href: "./cv" }} router={router} />
            )}
          </TabsContent>

          {/* Skills */}
          <TabsContent value="skills" className="mt-4">
            {profile.skills?.length ? (
              <div className="card-base">
                <div className="flex flex-wrap gap-2">
                  {profile.skills.map((s, i) => (
                    <Badge key={i} variant="secondary" className="text-sm px-3 py-1.5">
                      <span>{s.name}</span>
                      {s.yearsOfExperience > 0 && (
                        <span className="ms-1.5 text-xs text-muted-foreground">{s.yearsOfExperience}y</span>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState icon={Award} label="No skills added" action={{ label: "Upload CV", href: "./cv" }} router={router} />
            )}
          </TabsContent>

          {/* Other: languages, certs, links */}
          <TabsContent value="other" className="mt-4 space-y-4">
            {profile.languages?.length > 0 && (
              <div className="card-base">
                <h3 className="text-sm font-semibold mb-3">Languages</h3>
                <div className="flex flex-wrap gap-2">
                  {profile.languages.map((l, i) => (
                    <Badge key={i} variant="outline" className="capitalize">{l.language} · {l.level}</Badge>
                  ))}
                </div>
              </div>
            )}
            {profile.certifications?.length > 0 && (
              <div className="card-base">
                <h3 className="text-sm font-semibold mb-3">Certifications</h3>
                <ul className="space-y-1">
                  {profile.certifications.map((c, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <Award className="w-4 h-4 text-primary" /> {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(profile.linkedin || profile.portfolio) && (
              <div className="card-base">
                <h3 className="text-sm font-semibold mb-3">Links</h3>
                <div className="space-y-2">
                  {profile.linkedin && (
                    <a href={profile.linkedin} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <Link2 className="w-4 h-4" /> LinkedIn
                    </a>
                  )}
                  {profile.portfolio && (
                    <a href={profile.portfolio} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <Link2 className="w-4 h-4" /> Portfolio
                    </a>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon, label, action, router
}: {
  icon: React.ElementType;
  label: string;
  action: { label: string; href: string };
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <div className="card-base text-center py-10">
      <Icon className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
      <p className="text-sm text-muted-foreground mb-3">{label}</p>
      <Button size="sm" variant="outline" onClick={() => router.push(action.href)}>
        {action.label}
      </Button>
    </div>
  );
}
