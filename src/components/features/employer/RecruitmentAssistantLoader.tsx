"use client";

import { useState, useEffect } from "react";
import { RecruitmentAssistant } from "@/components/features/employer/RecruitmentAssistant";

export function RecruitmentAssistantLoader() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return <RecruitmentAssistant />;
}
