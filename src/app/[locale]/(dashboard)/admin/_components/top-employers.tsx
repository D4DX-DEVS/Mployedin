import Link from "next/link";
import { Trophy } from "lucide-react";
import { Panel } from "@/components/shared/DashboardKit";
import type { TopEmployer } from "@/lib/admin/dashboard/trends.server";
import { formatCount } from "@/lib/ui/intlFormat";
import type { DashboardTranslator } from "./types";

interface Props {
  employers: readonly TopEmployer[];
  days: number;
  locale: string;
  t: DashboardTranslator;
}

/** Companies whose jobs drew the most applications in the period. */
export function TopEmployersPanel({ employers, days, locale, t }: Props) {
  const max = Math.max(1, ...employers.map((e) => e.applications));
  return (
    <Panel id="admin-top-employers" icon={Trophy} iconClassName="bg-amber-100 text-amber-900" title={t("topEmployers.title")} subtitle={t("topEmployers.description", { days })} action={{ href: `/${locale}/admin/employers`, label: t("employers.viewEmployers") }}>
      {employers.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("topEmployers.empty")}</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-start text-[11px] uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="pb-2 text-start font-medium">{t("topEmployers.company")}</th>
              <th scope="col" className="pb-2 text-end font-medium">{t("topEmployers.activeJobs")}</th>
              <th scope="col" className="pb-2 text-end font-medium">{t("snapshot.applications")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {employers.map((e, i) => (
              <tr key={e.id}>
                <td className="py-2 pe-2">
                  <Link href={`/${locale}/admin/employers?search=${encodeURIComponent(e.name)}`} className="flex items-center gap-2 font-medium text-foreground hover:text-primary">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                    <span className="truncate">{e.name || "—"}</span>
                  </Link>
                  <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((e.applications / max) * 100)}%` }} />
                  </span>
                </td>
                <td className="py-2 text-end tabular-nums text-foreground">{formatCount(e.activeJobs)}</td>
                <td className="py-2 text-end font-semibold tabular-nums text-foreground">{formatCount(e.applications)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
