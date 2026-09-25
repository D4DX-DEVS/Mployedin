/**
 * @jest-environment node
 */
// Admin audit logs and webhooks printed raw codes ("login.success") — ADM-03.
import { formatActionCode } from "@/lib/admin/actionLabels";

describe("formatActionCode", () => {
  it.each([
    ["login.success", "Login · Success"],
    ["subscription.cron_expiry", "Subscription · Cron Expiry"],
    ["invoice.payment.verified", "Invoice · Payment Verified"],
    ["logout", "Logout"],
  ])("%s → %s", (code, label) => {
    expect(formatActionCode(code)).toBe(label);
  });
});
