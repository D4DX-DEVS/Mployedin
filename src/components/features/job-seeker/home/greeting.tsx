"use client";

import { useEffect, useState } from "react";

interface GreetingProps {
  /** Pre-translated lines; `hello` is what the server renders before the browser's hour is known. */
  labels: { hello: string; morning: string; afternoon: string; evening: string };
  className?: string;
}

/**
 * Greets by the reader's local hour. Resolved after mount: the server and the
 * browser can sit in different time zones, so picking during render would
 * hydrate mismatched.
 */
export function Greeting({ labels, className }: GreetingProps) {
  const [dayPart, setDayPart] = useState<"morning" | "afternoon" | "evening" | null>(null);
  useEffect(() => {
    const hour = new Date().getHours();
    setDayPart(hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening");
  }, []);
  return <h1 className={className}>{dayPart ? labels[dayPart] : labels.hello}</h1>;
}
