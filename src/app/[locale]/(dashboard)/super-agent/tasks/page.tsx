"use client";

import { TasksHub } from "@/components/features/tasks/TasksHub";

/** Super agent Tasks: their own list, and the tasks they gave their team and its review. */
export default function SuperAgentTasksPage() {
  return <TasksHub audience="super_agent" />;
}
