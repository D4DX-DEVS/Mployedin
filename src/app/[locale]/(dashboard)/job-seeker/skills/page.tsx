"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Sparkles, Plus, Loader2, TrendingUp, BookOpen } from "lucide-react";

interface SkillSuggestion {
  skill: string;
  reason: string;
  priority: "high" | "medium" | "low";
  resourceUrl?: string;
}

interface SkillsGapResult {
  overallScore: number;
  existingStrengths: string[];
  criticalGaps: string[];
  estimatedTimeToReady: string;
  recommendations: { skill: string; action: string; timeframe: string }[];
}

export default function JobSeekerSkillsPage() {
  const [suggestions, setSuggestions] = useState<SkillSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [targetRole, setTargetRole] = useState("");
  const [gapResult, setGapResult] = useState<SkillsGapResult | null>(null);
  const [loadingGap, setLoadingGap] = useState(false);
  const [mySkills, setMySkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState("");

  const loadSuggestions = useCallback(async () => {
    setLoadingSuggestions(true);
    try {
      const res = await fetch("/api/ai/skills-suggest");
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
      }
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  useEffect(() => { loadSuggestions(); }, [loadSuggestions]);

  const analyzeGap = async () => {
    if (!targetRole.trim()) return;
    setLoadingGap(true);
    try {
      const res = await fetch("/api/ai/skills-gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetRole, currentSkills: mySkills }),
      });
      if (res.ok) {
        const data = await res.json();
        setGapResult(data);
      }
    } finally {
      setLoadingGap(false);
    }
  };

  const addSkill = () => {
    if (!newSkill.trim() || mySkills.includes(newSkill.trim())) return;
    setMySkills((prev) => [...prev, newSkill.trim()]);
    setNewSkill("");
  };

  const priorityColor = (p: string) =>
    p === "high" ? "bg-red-50 text-red-700 border-red-200" :
    p === "medium" ? "bg-amber-50 text-amber-700 border-amber-200" :
    "bg-blue-50 text-blue-700 border-blue-200";

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="AI Skills Coach"
        description="Get personalised skill suggestions and gap analysis for your target role"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Suggested skills */}
        <div className="card-base space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Recommended for You</h3>
            </div>
            <button
              onClick={loadSuggestions}
              disabled={loadingSuggestions}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              {loadingSuggestions ? <Loader2 className="h-3 w-3 animate-spin" /> : <TrendingUp className="h-3 w-3" />}
              Refresh
            </button>
          </div>

          {loadingSuggestions ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Complete your profile to get personalised suggestions
            </p>
          ) : (
            <div className="space-y-3">
              {suggestions.map((s, i) => (
                <div key={i} className={`p-3 rounded-lg border text-sm ${priorityColor(s.priority)}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold">{s.skill}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/60 capitalize">{s.priority}</span>
                  </div>
                  <p className="text-xs opacity-80">{s.reason}</p>
                  {s.resourceUrl && (
                    <a href={s.resourceUrl} target="_blank" rel="noreferrer"
                      className="text-xs mt-1 flex items-center gap-1 hover:underline">
                      <BookOpen className="h-3 w-3" /> Learn
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Skills gap analyser */}
        <div className="card-base space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Gap Analysis</h3>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Target Role</label>
            <input
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. Senior DevOps Engineer"
              className="input-field w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Your Current Skills</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {mySkills.map((s) => (
                <span key={s}
                  className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center gap-1">
                  {s}
                  <button onClick={() => setMySkills((p) => p.filter((x) => x !== s))} className="hover:text-red-500">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSkill()}
                placeholder="Add a skill…"
                className="input-field flex-1 h-8 text-xs"
              />
              <button onClick={addSkill}
                className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <button
            onClick={analyzeGap}
            disabled={!targetRole.trim() || loadingGap}
            className="btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loadingGap ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loadingGap ? "Analysing…" : "Analyse Gap"}
          </button>

          {gapResult && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Readiness Score</span>
                <span className={`text-lg font-bold ${
                  gapResult.overallScore >= 70 ? "text-green-600" :
                  gapResult.overallScore >= 40 ? "text-amber-600" : "text-red-600"
                }`}>{gapResult.overallScore}%</span>
              </div>

              {gapResult.existingStrengths.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-green-700 mb-1">Strengths</p>
                  <div className="flex flex-wrap gap-1">
                    {gapResult.existingStrengths.map((s, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs border border-green-200">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {gapResult.criticalGaps.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-700 mb-1">Critical Gaps</p>
                  <div className="flex flex-wrap gap-1">
                    {gapResult.criticalGaps.map((s, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs border border-red-200">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Estimated time to readiness: <strong>{gapResult.estimatedTimeToReady}</strong>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
