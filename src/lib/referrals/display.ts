/** One name for a registration row whichever audience produced it. */
export function registrationDisplayName(reg: {
  kind?: string;
  name?: string;
  companyName?: string;
  email: string;
}): string {
  if (reg.kind === "job_seeker") return reg.name || reg.email;
  return reg.companyName || reg.email;
}
