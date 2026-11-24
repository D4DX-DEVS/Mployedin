import { Suspense } from "react";
import { StaffReportPage } from "../../_components/staff-report/StaffReportPage";

/** Admin → People → super-agents → one person's read-only performance report. */
export default function Page() {
  return (
    <Suspense>
      <StaffReportPage kind="super_agent" />
    </Suspense>
  );
}
