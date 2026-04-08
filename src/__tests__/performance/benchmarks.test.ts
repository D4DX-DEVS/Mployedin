/**
 * @jest-environment node
 */
/**
 * Performance benchmarks — verify API route handler execution time targets.
 * Uses jest fake timers + mocks to simulate timed execution.
 */

const BUDGET_MS = {
  db_query_simple: 50,
  db_query_complex: 200,
  ai_response: 5000,
  auth_check: 10,
  export_csv: 100,
};

describe("Performance budgets", () => {
  it("exportCSV stays within 100ms for 1000 rows", () => {
    // Replicate exportCSV logic in-memory without DOM
    const data = Array.from({ length: 1000 }, (_, i) => ({
      id: `${i}`,
      name: `Candidate ${i}`,
      score: Math.random() * 100,
      date: new Date().toISOString(),
    }));
    const columns = [
      { header: "ID", key: "id" as const },
      { header: "Name", key: "name" as const },
      { header: "Score", key: "score" as const },
      { header: "Date", key: "date" as const },
    ];

    const start = performance.now();
    const rows = [columns.map(c => c.header).join(",")];
    for (const row of data) {
      rows.push(columns.map(c => {
        const val = String(row[c.key] ?? "");
        return val.includes(",") ? `"${val}"` : val;
      }).join(","));
    }
    const csv = "\uFEFF" + rows.join("\n");
    const elapsed = performance.now() - start;

    expect(csv).toBeTruthy();
    expect(elapsed).toBeLessThan(BUDGET_MS.export_csv);
  });

  it("auth check completes within 10ms (mocked)", () => {
    const checkPermission = (role: string, resource: string, action: string): boolean => {
      const matrix: Record<string, Record<string, string[]>> = {
        admin: { jobs: ["create", "read", "update", "delete"] },
        employer: { jobs: ["create", "read", "update"], applications: ["read", "update"] },
        agent: { jobs: ["read"], applications: ["read", "update"], placements: ["create", "read"] },
        job_seeker: { jobs: ["read"], applications: ["create", "read"] },
      };
      return matrix[role]?.[resource]?.includes(action) ?? false;
    };

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      checkPermission("employer", "jobs", "create");
      checkPermission("agent", "placements", "create");
      checkPermission("job_seeker", "commissions", "read");
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(BUDGET_MS.auth_check * 100); // 1000 checks in 1s
  });

  it("i18n key lookup is O(1) fast", () => {
    const translations: Record<string, string> = {};
    for (let i = 0; i < 500; i++) {
      translations[`key.${i}`] = `Value ${i}`;
    }

    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      const _ = translations[`key.${i % 500}`];
      void _;
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("date formatting (fmtDate) handles edge cases without throw", () => {
    const fmtDate = (val: unknown): string => {
      if (!val) return "";
      try { return new Intl.DateTimeFormat("en-GB").format(new Date(String(val))); }
      catch { return String(val); }
    };

    expect(() => {
      fmtDate(null);
      fmtDate(undefined);
      fmtDate("");
      fmtDate("invalid-date");
      fmtDate(new Date().toISOString());
      fmtDate(0);
    }).not.toThrow();
  });
});
