"use client";

import { TasksHub } from "@/components/features/tasks/TasksHub";

/** Admin Tasks: their own list, and the tasks they gave agents and their review. */
export default function AdminTasksPage() {
  return <TasksHub audience="admin" />;
}
