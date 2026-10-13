"use client";

import { AssignedTasksWorkspace } from "@/components/features/tasks/AssignedTasksWorkspace";

/** Every agent's assigned tasks, whoever gave them, and their review. */
export default function AdminAgentTasksPage() {
  return <AssignedTasksWorkspace audience="admin" />;
}
