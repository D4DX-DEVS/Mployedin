/**
 * An employer account's numbers, as the agent dashboard's accounts card and
 * the agent employers list print them. No model imports: the list's client
 * components read these too.
 */
export interface AccountActivity {
  openJobs: number;
  newApplicants: number;
  upcomingInterviews: number;
  hires: number;
}

export const NO_ACTIVITY: AccountActivity = { openJobs: 0, newApplicants: 0, upcomingInterviews: 0, hires: 0 };
