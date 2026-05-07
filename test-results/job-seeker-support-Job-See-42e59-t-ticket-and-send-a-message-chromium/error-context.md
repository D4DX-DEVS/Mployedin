# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: job-seeker-support.spec.ts >> Job Seeker Support Ticket >> can create a support ticket and send a message
- Location: e2e\job-seeker-support.spec.ts:49:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e4]:
    - generic [ref=e9]:
      - link "Mployedin" [ref=e11] [cursor=pointer]:
        - /url: /en
        - img "Mployedin" [ref=e12]
      - generic [ref=e13]:
        - heading "Elevate your hiring pipeline with a sharper command center." [level=1] [ref=e14]
        - paragraph [ref=e15]: Move from sourcing to shortlist with a calmer workspace designed for modern recruitment teams, international hiring, and faster decision cycles.
      - generic [ref=e16]: © 2026 MPLOYEDIN. All rights reserved.
    - generic [ref=e17]:
      - button "Switch to dark mode" [ref=e20]:
        - img
      - generic [ref=e23]:
        - generic [ref=e24]:
          - heading "Welcome back" [level=1] [ref=e25]
          - paragraph [ref=e26]: Please enter your credentials to access your account.
        - generic [ref=e27]:
          - generic [ref=e28]:
            - text: Email address
            - textbox "Email address" [ref=e29]:
              - /placeholder: name@example.com
              - text: jobseeker@test.mployedin.com
          - generic [ref=e30]:
            - generic [ref=e31]:
              - generic [ref=e32]: Password
              - link "Forgot password?" [ref=e33] [cursor=pointer]:
                - /url: /en/forgot-password
            - generic [ref=e34]:
              - textbox "Password" [ref=e35]:
                - /placeholder: ••••••••
                - text: TestPass123!
              - button "Show password" [ref=e36]:
                - img [ref=e37]
          - generic [ref=e40]:
            - checkbox "Remember my email" [ref=e41]
            - checkbox
            - generic [ref=e42] [cursor=pointer]: Remember my email
          - paragraph [ref=e44]: Invalid email or password
          - button "Sign in" [ref=e45]
        - generic [ref=e50]: or continue with
        - generic [ref=e51]:
          - button "Google" [ref=e52]:
            - img
            - text: Google
          - button "Apple" [ref=e53]:
            - img
            - text: Apple
          - button "LinkedIn" [ref=e54]:
            - img
            - text: LinkedIn
        - paragraph [ref=e55]:
          - text: Don't have an account?
          - link "Create account" [ref=e56] [cursor=pointer]:
            - /url: /en/register
          - text: ·
          - link "Post jobs as employer" [ref=e57] [cursor=pointer]:
            - /url: /en/employer-register
  - button "Open Next.js Dev Tools" [ref=e63] [cursor=pointer]:
    - img [ref=e64]
  - alert [ref=e67]
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | 
  3   | /**
  4   |  * Job Seeker Support Ticket E2E Test
  5   |  * Tests the full support flow:
  6   |  * 1. Login as job seeker
  7   |  * 2. Navigate to support page
  8   |  * 3. Create a new ticket
  9   |  * 4. Send a message in the ticket
  10  |  * 5. Verify ticket appears in conversation list
  11  |  */
  12  | 
  13  | const JOB_SEEKER_EMAIL = process.env.E2E_JS_EMAIL ?? "jobseeker@test.mployedin.com";
  14  | const JOB_SEEKER_PASS = process.env.E2E_JS_PASS ?? "TestPass123!";
  15  | 
  16  | test.describe("Job Seeker Support Ticket", () => {
  17  |   test.beforeEach(async ({ page }) => {
  18  |     // Login as job seeker
  19  |     await page.goto("/en/login");
  20  |     await page.fill("input[type=email]", JOB_SEEKER_EMAIL);
  21  |     await page.fill("input[type=password]", JOB_SEEKER_PASS);
  22  |     await page.click("button[type=submit]");
> 23  |     await page.waitForURL(/job-seeker|dashboard/, { timeout: 15_000 });
      |                ^ TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
  24  |   });
  25  | 
  26  |   test("support page renders correctly", async ({ page }) => {
  27  |     await page.goto("/en/job-seeker/messages");
  28  |     await page.waitForLoadState("networkidle");
  29  | 
  30  |     // Should see the Support title and "New Ticket" button
  31  |     await expect(page.getByText("Support")).toBeVisible({ timeout: 10_000 });
  32  |     await expect(page.getByRole("button", { name: /New Ticket/i })).toBeVisible();
  33  |   });
  34  | 
  35  |   test("can open new ticket dialog", async ({ page }) => {
  36  |     await page.goto("/en/job-seeker/messages");
  37  |     await page.waitForLoadState("networkidle");
  38  | 
  39  |     // Click "New Ticket" button
  40  |     await page.getByRole("button", { name: /New Ticket/i }).click();
  41  | 
  42  |     // Dialog should appear with Category and Message fields
  43  |     await expect(page.getByText("New Support Ticket")).toBeVisible();
  44  |     await expect(page.getByText("Category")).toBeVisible();
  45  |     await expect(page.getByText("Message")).toBeVisible();
  46  |     await expect(page.getByRole("button", { name: /Submit Ticket/i })).toBeVisible();
  47  |   });
  48  | 
  49  |   test("can create a support ticket and send a message", async ({ page }) => {
  50  |     await page.goto("/en/job-seeker/messages");
  51  |     await page.waitForLoadState("networkidle");
  52  | 
  53  |     // Open ticket dialog
  54  |     await page.getByRole("button", { name: /New Ticket/i }).click();
  55  |     await expect(page.getByText("New Support Ticket")).toBeVisible();
  56  | 
  57  |     // Fill in the ticket message
  58  |     const testMessage = `E2E Test Support Ticket - ${Date.now()}`;
  59  |     await page.getByPlaceholder(/Describe your issue/i).fill(testMessage);
  60  | 
  61  |     // Submit ticket
  62  |     await page.getByRole("button", { name: /Submit Ticket/i }).click();
  63  | 
  64  |     // Wait for dialog to close and conversation to load
  65  |     await expect(page.getByText("New Support Ticket")).not.toBeVisible({ timeout: 10_000 });
  66  | 
  67  |     // The message should appear in the chat area
  68  |     await expect(page.getByText(testMessage)).toBeVisible({ timeout: 10_000 });
  69  | 
  70  |     // Send a follow-up message in the ticket conversation
  71  |     const followUpMessage = `Follow-up message - ${Date.now()}`;
  72  |     const messageInput = page.getByPlaceholder(/Type a message/i);
  73  |     if (await messageInput.isVisible()) {
  74  |       await messageInput.fill(followUpMessage);
  75  |       await messageInput.press("Enter");
  76  | 
  77  |       // Verify follow-up message appears
  78  |       await expect(page.getByText(followUpMessage)).toBeVisible({ timeout: 10_000 });
  79  |     }
  80  |   });
  81  | 
  82  |   test("duplicate ticket returns existing conversation", async ({ page }) => {
  83  |     await page.goto("/en/job-seeker/messages");
  84  |     await page.waitForLoadState("networkidle");
  85  | 
  86  |     // Create first ticket
  87  |     await page.getByRole("button", { name: /New Ticket/i }).click();
  88  |     await page.getByPlaceholder(/Describe your issue/i).fill("Duplicate test ticket");
  89  |     await page.getByRole("button", { name: /Submit Ticket/i }).click();
  90  |     await expect(page.getByText("New Support Ticket")).not.toBeVisible({ timeout: 10_000 });
  91  | 
  92  |     // Try to create another ticket — should return existing conversation (no error)
  93  |     await page.getByRole("button", { name: /New Ticket/i }).click();
  94  |     await page.getByPlaceholder(/Describe your issue/i).fill("Another ticket attempt");
  95  |     await page.getByRole("button", { name: /Submit Ticket/i }).click();
  96  | 
  97  |     // Should not show any error — dialog closes successfully
  98  |     await expect(page.getByText("New Support Ticket")).not.toBeVisible({ timeout: 10_000 });
  99  |   });
  100 | });
  101 | 
```