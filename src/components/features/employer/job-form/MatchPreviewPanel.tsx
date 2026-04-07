"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface MatchPreviewPanelProps {
  skills: string[];
  country: string;
  experienceMin: number;
  experienceMax: number;
}

interface MatchData {
  count: number;
  topSkills: string[];
}

export function MatchPreviewPanel({
  skills,
  country,
  experienceMin,
  experienceMax,
}: MatchPreviewPanelProps) {
  const [data, setData] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    // Only fetch when there's something meaningful to query
    if (skills.length === 0 && !country) {
      setData(null);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (skills.length > 0) params.set("skills", skills.slice(0, 15).join(","));
        if (country) params.set("country", country);
        if (experienceMin > 0) params.set("experienceMin", String(experienceMin));
        if (experienceMax > 0) params.set("experienceMax", String(experienceMax));

        const res = await fetch(`/api/jobs/match-preview?${params.toString()}`);
        if (res.ok) {
          const json = (await res.json()) as MatchData;
          setData(json);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }, 2000);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [skills, country, experienceMin, experienceMax]);

  if (!data && !loading) return null;

  return (
    <div className="rounded-xl border border-border bg-background p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Users className="w-4 h-4 text-primary" />
          Candidate Preview
        </div>
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {data && !loading && (
          <motion.div
            key={`${data.count}-${data.topSkills.join(",")}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <div>
              <span className="text-2xl font-bold text-foreground tabular-nums">
                ~{data.count.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground ml-2">
                matching candidates
              </span>
            </div>

            {data.topSkills.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">
                  Top skills in this pool
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {data.topSkills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Based on current candidate profiles on the platform.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
