"use client";

import { TasksHub } from "@/components/features/tasks/TasksHub";

/** The agent's Tasks: their own to-dos ("My tasks") and tasks given to them ("Given to me"). */
export default function AgentTasksPage() {
  return <TasksHub audience="agent" />;
}
