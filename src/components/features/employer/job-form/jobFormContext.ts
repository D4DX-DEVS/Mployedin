import { createContext, useContext } from "react";

/** Which dashboard the job wizard is mounted in. */
export type JobFormBasePath = "employer" | "admin" | "agent";

const JobFormBasePathContext = createContext<JobFormBasePath>("employer");

export const JobFormBasePathProvider = JobFormBasePathContext.Provider;

/**
 * Lets a step adapt to who is posting without threading a prop through every
 * step. An agent, for one, is credited with the job by the server, so the
 * employer's "assign an agent" control has nothing to offer them.
 */
export function useJobFormBasePath(): JobFormBasePath {
  return useContext(JobFormBasePathContext);
}
