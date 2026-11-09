import type { GapKind } from "./compute";

/** The title and brief of the task an admin gives an agent from a suggestion. */
export function gapTaskText(g: { kind: GapKind; role: string; areaName: string; seekers: number; jobs: number; note?: string }) {
  const where = g.areaName || "the area";
  let title: string;
  let body: string;
  switch (g.kind) {
    case "find_employers":
      title = `Find employers hiring ${g.role} in ${where}`;
      body = `${g.seekers} job seekers in ${where} want ${g.role} work and there are no open jobs for it. Reach out to employers in this line of work.`;
      break;
    case "thin_supply":
      title = `Bring more ${g.role} jobs in ${where}`;
      body = `${g.seekers} seekers are waiting for ${g.jobs} open ${g.role} job(s) in ${where}. Ask employers for more roles.`;
      break;
    case "find_seekers":
      title = `Find ${g.role} candidates in ${where}`;
      body = `${g.jobs} open ${g.role} job(s) in ${where} have almost no matching seekers. Run a seeker campaign.`;
      break;
    default:
      title = "Complete seeker profiles with an area";
      body = `${g.seekers} seekers have no area set, so they cannot be matched to any agent area. Ask them to complete their profile.`;
  }
  return { title, description: g.note ? `${body}\n\nNote from admin: ${g.note}` : body };
}
