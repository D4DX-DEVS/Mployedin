import type { ReactNode } from "react";

interface Slots {
  header: ReactNode;
  kpis: ReactNode;
  status: ReactNode;
  recommended: ReactNode;
  applications: ReactNode;
  interviews: ReactNode;
  boost: ReactNode;
  /** Optional banner between the header and the numbers (e.g. a refresh error). */
  notice?: ReactNode;
}

/**
 * The seeker home's one scrollable layout, shared by the streaming server page
 * and the client fallback so both paint the same thing.
 *
 * Phones are the main audience: everything is one column, and the
 * recommended jobs come before the status donut there (`order-first`) because
 * that is what a seeker opens the page for.
 */
export function HomeGrid({ header, notice, kpis, status, recommended, applications, interviews, boost }: Slots) {
  return (
    <div className="page-container dashboard-overview-page space-y-4">
      {header}
      {notice}
      {kpis}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-4">{status}</div>
        <div className="order-first min-w-0 xl:order-none xl:col-span-8">{recommended}</div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {applications}
        {interviews}
        {boost}
      </div>
    </div>
  );
}
