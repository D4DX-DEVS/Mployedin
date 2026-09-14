/**
 * Source guards for the admin Users table.
 *
 * Two controls on this page used to fire straight from a click with nothing in
 * between: the role dropdown (which rebuilds an account and archives its
 * profile) and the bulk Apply button (whose "Delete" option cascades through
 * jobs, applications, interviews, placements and commissions). Both sit in a
 * table that re-renders under a filter, so a mis-aimed click landed on whoever
 * had moved into that row.
 *
 * These assertions are deliberately source-level: they pin the wiring that a
 * future refactor is most likely to undo quietly.
 */
import fs from "fs";
import path from "path";

const PAGE = path.join(
  process.cwd(),
  "src/app/[locale]/(dashboard)/admin/users/page.tsx",
);

const source = fs.readFileSync(PAGE, "utf8");

describe("admin users page - destructive controls are guarded", () => {
  it("routes the role dropdown through the confirming handler, not updateUser", () => {
    expect(source).toContain("onClick={() => changeUserRole(user, r)}");
    // The unguarded call this replaced.
    expect(source).not.toContain("updateUser(user._id, { role: r })");
  });

  it("asks before changing a role, and says what it costs", () => {
    expect(source).toContain("changeRoleConfirmTitle");
    expect(source).toContain("changeRoleConfirmMessage");
    // Employer conversions take live jobs off the public board; say so.
    expect(source).toContain("changeRoleEmployerNote");
    expect(source).toContain("changeRoleSeekerNote");
  });

  it("asks before every destructive bulk action", () => {
    for (const key of [
      "bulkConfirmSetRoleTitle",
      "bulkConfirmDeactivateTitle",
      "bulkConfirmDeleteTitle",
    ]) {
      expect(source).toContain(key);
    }
  });

  it("puts the bulk confirm before the request, not after it", () => {
    const applyBulk = source.slice(source.indexOf("async function applyBulk"));
    const body = applyBulk.slice(0, applyBulk.indexOf("\n  }\n"));
    const confirmAt = body.indexOf("await confirm(");
    const fetchAt = body.indexOf("fetch(\"/api/admin/users\"");
    expect(confirmAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(-1);
    expect(confirmAt).toBeLessThan(fetchAt);
  });

  it("only claims an action succeeded once the request did", () => {
    // toggleUserActive used to toast "deactivated" even when the PATCH failed
    // and had already toasted an error.
    expect(source).toContain("const changed = await updateUser(user._id, { isActive: !user.isActive });");
    expect(source).toContain("if (!changed) return;");
  });

  it("keeps the confirm dialog mounted", () => {
    expect(source).toContain("{ConfirmDialogNode}");
  });
});
