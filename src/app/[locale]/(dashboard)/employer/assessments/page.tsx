"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  ClipboardCheck, Plus, Trash2, Edit, Users, BarChart3,
  Clock, CheckCircle2, XCircle, ChevronDown, ChevronUp,
} from "lucide-react";

interface Assessment {
  _id: string;
  title: string;
  description?: string;
  skills: string[];
  questions: { id: string; question: string; type: string; points: number }[];
  totalPoints: number;
  passingScore: number;
  timeLimit: number;
  isActive: boolean;
  attemptsAllowed: number;
  totalAttempts: number;
  avgScore: number;
  createdAt: string;
}

export default function EmployerAssessmentsPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchAssessments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/assessments");
      if (res.ok) {
        const data = await res.json();
        setAssessments(data.assessments ?? []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAssessments(); }, [fetchAssessments]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-primary" />
            Skill Assessments
          </h1>
          <p className="text-muted-foreground mt-1">Create tests to evaluate candidate skills</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Assessment
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard icon={<ClipboardCheck className="w-5 h-5 text-primary" />} label="Total Tests" value={assessments.length} />
        <StatCard icon={<CheckCircle2 className="w-5 h-5 text-green-600" />} label="Active" value={assessments.filter(a => a.isActive).length} />
        <StatCard icon={<Users className="w-5 h-5 text-blue-600" />} label="Total Attempts" value={assessments.reduce((s, a) => s + a.totalAttempts, 0)} />
        <StatCard icon={<BarChart3 className="w-5 h-5 text-purple-600" />} label="Avg Score" value={`${assessments.length > 0 ? Math.round(assessments.reduce((s, a) => s + a.avgScore, 0) / assessments.length) : 0}%`} />
      </div>

      {/* Assessment List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : assessments.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-semibold text-foreground mb-1">No assessments yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Create your first skill test to evaluate candidates</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90"
          >
            Create Assessment
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {assessments.map((assessment) => (
            <div key={assessment._id} className="bg-card border border-border rounded-xl overflow-hidden">
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(expandedId === assessment._id ? null : assessment._id)}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${assessment.isActive ? "bg-green-500/10" : "bg-muted"}`}>
                    <ClipboardCheck className={`w-5 h-5 ${assessment.isActive ? "text-green-600" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">{assessment.title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{assessment.questions.length} questions</span>
                      <span>•</span>
                      <span>{assessment.timeLimit} min</span>
                      <span>•</span>
                      <span>{assessment.totalAttempts} attempts</span>
                      <span>•</span>
                      <span>Pass: {assessment.passingScore}%</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1 flex-wrap">
                    {assessment.skills.slice(0, 3).map((skill) => (
                      <span key={skill} className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
                        {skill}
                      </span>
                    ))}
                  </div>
                  {expandedId === assessment._id ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </div>

              {expandedId === assessment._id && (
                <div className="px-4 pb-4 border-t border-border pt-3">
                  {assessment.description && (
                    <p className="text-sm text-muted-foreground mb-3">{assessment.description}</p>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {assessment.questions.map((q, i) => (
                      <div key={q.id} className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Q{i + 1} • {q.type.replace("_", " ")} • {q.points} pts</p>
                        <p className="text-sm text-foreground line-clamp-2">{q.question}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><BarChart3 className="w-3.5 h-3.5" /> Avg score: {assessment.avgScore}%</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {assessment.timeLimit} minutes</span>
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {assessment.attemptsAllowed} attempts allowed</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateAssessmentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchAssessments(); }}
        />
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="p-4 bg-card border border-border rounded-xl flex items-center gap-3">
      <div className="p-2 bg-muted rounded-lg">{icon}</div>
      <div>
        <p className="text-lg font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function CreateAssessmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [skills, setSkills] = useState("");
  const [timeLimit, setTimeLimit] = useState(30);
  const [passingScore, setPassingScore] = useState(60);
  const [questions, setQuestions] = useState<{ id: string; question: string; type: string; options: string[]; correctAnswer: string; points: number; order: number }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const addQuestion = () => {
    setQuestions([...questions, {
      id: `q_${Date.now()}`,
      question: "",
      type: "multiple_choice",
      options: ["", "", "", ""],
      correctAnswer: "",
      points: 10,
      order: questions.length,
    }]);
  };

  const updateQuestion = (idx: number, updates: Partial<typeof questions[0]>) => {
    const updated = [...questions];
    updated[idx] = { ...updated[idx], ...updates };
    setQuestions(updated);
  };

  const removeQuestion = (idx: number) => {
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || questions.length === 0) {
      toast.error("Title and at least one question required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || undefined,
          skills: skills.split(",").map(s => s.trim()).filter(Boolean),
          timeLimit,
          passingScore,
          questions: questions.map(q => ({
            ...q,
            options: q.type === "multiple_choice" ? q.options.filter(Boolean) : undefined,
          })),
        }),
      });
      if (res.ok) {
        toast.success("Assessment created!");
        onCreated();
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to create");
      }
    } catch { toast.error("Network error"); } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-foreground mb-4">Create Skill Assessment</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">Title *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background" placeholder="e.g. React Developer Assessment" required />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background" rows={2} placeholder="Brief description of the assessment" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground">Skills (comma-separated)</label>
              <input type="text" value={skills} onChange={e => setSkills(e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background" placeholder="React, TypeScript, Node.js" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-medium text-foreground">Time (min)</label>
                <input type="number" value={timeLimit} onChange={e => setTimeLimit(+e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background" min={5} max={180} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Pass %</label>
                <input type="number" value={passingScore} onChange={e => setPassingScore(+e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background" min={1} max={100} />
              </div>
            </div>
          </div>

          {/* Questions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground">Questions ({questions.length})</label>
              <button type="button" onClick={addQuestion} className="text-xs px-3 py-1 bg-primary/10 text-primary rounded-lg hover:bg-primary/20">
                + Add Question
              </button>
            </div>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {questions.map((q, idx) => (
                <div key={q.id} className="p-3 border border-border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-muted-foreground">Q{idx + 1}</span>
                    <select value={q.type} onChange={e => updateQuestion(idx, { type: e.target.value })} className="text-xs px-2 py-1 border border-border rounded bg-background">
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="true_false">True/False</option>
                      <option value="short_answer">Short Answer</option>
                    </select>
                    <input type="number" value={q.points} onChange={e => updateQuestion(idx, { points: +e.target.value })} className="w-16 text-xs px-2 py-1 border border-border rounded bg-background" min={1} />
                    <span className="text-xs text-muted-foreground">pts</span>
                    <button type="button" onClick={() => removeQuestion(idx)} className="ml-auto text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <input type="text" value={q.question} onChange={e => updateQuestion(idx, { question: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background mb-2" placeholder="Enter your question" />
                  {q.type === "multiple_choice" && (
                    <div className="grid grid-cols-2 gap-1">
                      {q.options.map((opt, oi) => (
                        <input key={oi} type="text" value={opt} onChange={e => {
                          const opts = [...q.options]; opts[oi] = e.target.value; updateQuestion(idx, { options: opts });
                        }} className="px-2 py-1 text-xs border border-border rounded bg-background" placeholder={`Option ${oi + 1}`} />
                      ))}
                    </div>
                  )}
                  <input type="text" value={q.correctAnswer} onChange={e => updateQuestion(idx, { correctAnswer: e.target.value })} className="w-full mt-1 px-2 py-1 text-xs border border-border rounded bg-background" placeholder="Correct answer" />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {submitting ? "Creating..." : "Create Assessment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
