"use client";

import { useEffect, useState, useCallback } from "react";
import { X, User, TrendingUp, Briefcase, DollarSign, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MatchBreakdown {
  skills: number;
  experience: number;
  education: number;
  availability: number;
  overall: number;
}

interface CandidateData {
  applicationId: string;
  status: string;
  appliedAt: string;
  aiMatchScore: number | null;
  matchBreakdown: MatchBreakdown | null;
  candidate: {
    name: string;
    profilePicture: string | null;
    skills: string[];
    yearsOfExperience: number;
    preferredSalary: { min: number; max: number; currency: string } | null;
    profileCompleteness: number;
  };
  job: {
    title: string;
    salaryRange: { min: number; max: number; currency: string } | null;
  };
}

interface CompareResponse {
  candidates: CandidateData[];
  commonSkills: string[];
}

interface CandidateComparisonProps {
  /** Array of 2–3 application IDs to compare */
  applicationIds: string[];
  onClose: () => void;
  /** Called when employer shortlists or rejects from comparison view */
  onAction?: (applicationId: string, action: "shortlist" | "reject") => void;
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-400";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-200">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function CandidateComparison({ applicationIds, onClose, onAction }: CandidateComparisonProps) {
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchComparison = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/compare?ids=${applicationIds.join(",")}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [applicationIds]);

  useEffect(() => {
    fetchComparison();
  }, [fetchComparison]);

  const cols = data?.candidates.length ?? applicationIds.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Candidate Comparison</h2>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {loading && (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        )}

        {error && (
          <div className="m-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {data && (
          <div className="p-6">
            {/* Candidate name + photo row */}
            <div className={`grid gap-4`} style={{ gridTemplateColumns: `200px repeat(${cols}, 1fr)` }}>
              {/* Label column */}
              <div />
              {data.candidates.map((c) => (
                <div key={c.applicationId} className="flex flex-col items-center gap-2 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                    {c.candidate.profilePicture ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.candidate.profilePicture} alt={c.candidate.name} className="h-14 w-14 rounded-full object-cover" />
                    ) : (
                      <User size={28} />
                    )}
                  </div>
                  <p className="font-semibold text-gray-900">{c.candidate.name}</p>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {c.job.title}
                  </span>
                </div>
              ))}

              {/* AI Match Score */}
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <TrendingUp size={16} /> AI Match
              </div>
              {data.candidates.map((c) => (
                <div key={c.applicationId} className="text-center">
                  {c.aiMatchScore != null ? (
                    <span className={`text-2xl font-bold ${c.aiMatchScore >= 70 ? "text-green-600" : c.aiMatchScore >= 40 ? "text-yellow-600" : "text-red-500"}`}>
                      {Math.round(c.aiMatchScore)}%
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </div>
              ))}

              {/* Match breakdown */}
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600 self-start pt-1">
                <TrendingUp size={16} /> Score Breakdown
              </div>
              {data.candidates.map((c) => (
                <div key={c.applicationId} className="space-y-2">
                  {c.matchBreakdown ? (
                    <>
                      <ScoreBar value={c.matchBreakdown.skills} label="Skills" />
                      <ScoreBar value={c.matchBreakdown.experience} label="Experience" />
                      <ScoreBar value={c.matchBreakdown.education} label="Education" />
                      <ScoreBar value={c.matchBreakdown.availability} label="Availability" />
                    </>
                  ) : (
                    <span className="text-xs text-gray-400">No breakdown</span>
                  )}
                </div>
              ))}

              {/* Years of experience */}
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <Briefcase size={16} /> Experience
              </div>
              {data.candidates.map((c) => (
                <div key={c.applicationId} className="text-center text-sm text-gray-700">
                  {c.candidate.yearsOfExperience > 0
                    ? `${c.candidate.yearsOfExperience} yrs`
                    : "—"}
                </div>
              ))}

              {/* Salary expectation */}
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <DollarSign size={16} /> Salary Exp.
              </div>
              {data.candidates.map((c) => (
                <div key={c.applicationId} className="text-center text-sm text-gray-700">
                  {c.candidate.preferredSalary
                    ? `${c.candidate.preferredSalary.currency} ${c.candidate.preferredSalary.min.toLocaleString()}–${c.candidate.preferredSalary.max.toLocaleString()}`
                    : "—"}
                </div>
              ))}

              {/* Job salary range */}
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <DollarSign size={16} /> Job Range
              </div>
              {data.candidates.map((c) => (
                <div key={c.applicationId} className="text-center text-sm text-gray-700">
                  {c.job.salaryRange
                    ? `${c.job.salaryRange.currency} ${c.job.salaryRange.min.toLocaleString()}–${c.job.salaryRange.max.toLocaleString()}`
                    : "—"}
                </div>
              ))}

              {/* Skills */}
              <div className="self-start pt-1 text-sm font-medium text-gray-600">Skills</div>
              {data.candidates.map((c) => (
                <div key={c.applicationId} className="flex flex-wrap gap-1">
                  {c.candidate.skills.slice(0, 8).map((skill) => {
                    const isCommon = data.commonSkills.includes(skill.toLowerCase());
                    return (
                      <span
                        key={skill}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          isCommon
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {skill}
                      </span>
                    );
                  })}
                  {c.candidate.skills.length > 8 && (
                    <span className="text-xs text-gray-400">+{c.candidate.skills.length - 8}</span>
                  )}
                </div>
              ))}

              {/* Current stage */}
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600">Stage</div>
              {data.candidates.map((c) => (
                <div key={c.applicationId} className="text-center">
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 capitalize">
                    {c.status.replace(/_/g, " ")}
                  </span>
                </div>
              ))}

              {/* Actions */}
              {onAction && (
                <>
                  <div className="text-sm font-medium text-gray-600">Actions</div>
                  {data.candidates.map((c) => (
                    <div key={c.applicationId} className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full border-green-300 text-green-700 hover:bg-green-50"
                        onClick={() => onAction(c.applicationId, "shortlist")}
                      >
                        <CheckCircle size={14} className="mr-1" /> Shortlist
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full border-red-300 text-red-600 hover:bg-red-50"
                        onClick={() => onAction(c.applicationId, "reject")}
                      >
                        <XCircle size={14} className="mr-1" /> Reject
                      </Button>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Common skills legend */}
            {data.commonSkills.length > 0 && (
              <p className="mt-6 text-xs text-gray-500">
                <span className="inline-block h-2 w-2 rounded-full bg-green-400 mr-1" />
                Green skills are shared by all candidates
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
