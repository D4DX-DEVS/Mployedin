import { AgentJobsWorkspace } from "../jobs/_components/AgentJobsWorkspace";

/** Every live job on the portal: find, filter and share with seekers. */
export default function AgentBrowseJobsPage() {
  return <AgentJobsWorkspace mode="browse" />;
}
