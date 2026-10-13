"use client";

import { AssignedTasksWorkspace } from "@/components/features/tasks/AssignedTasksWorkspace";

/** Tasks this super agent gives their team, and the review of what comes back. */
export default function SuperAgentTasksPage() {
  return <AssignedTasksWorkspace audience="super_agent" />;
}
