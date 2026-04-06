"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ApplyButtonProps {
  jobId: string;
  locale: string;
}

export default function ApplyButton({ jobId, locale }: ApplyButtonProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState("");

  const role = (session?.user as { role?: string })?.role;
  const isJobSeeker = role === "job_seeker";

  if (status === "loading") {
    return <Button disabled className="w-full h-12 text-base"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</Button>;
  }

  if (!session) {
    return (
      <Button
        className="w-full h-12 text-base font-medium"
        onClick={() => router.push(`/${locale}/login?callbackUrl=/${locale}/jobs/${jobId}`)}
      >
        Sign in to Apply
      </Button>
    );
  }

  if (!isJobSeeker) {
    return (
      <Button variant="outline" className="w-full h-12 text-base" disabled>
        Job seekers only can apply
      </Button>
    );
  }

  if (applied) {
    return (
      <div className="w-full h-12 flex items-center justify-center rounded-lg bg-green-500/10 border border-green-500/30 text-green-600 font-medium text-sm">
        ✓ Application submitted!
      </div>
    );
  }

  async function handleApply() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setApplied(true); // already applied
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Failed to apply. Please try again.");
        return;
      }
      setApplied(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handleApply}
        disabled={loading}
        className="w-full h-12 text-base font-medium"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        Apply Now
      </Button>
      {error && <p className="text-xs text-destructive text-center">{error}</p>}
    </div>
  );
}
