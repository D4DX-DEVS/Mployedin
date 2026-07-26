import { expect, test } from "@playwright/test";

test("landing page has one page heading and no horizontal overflow", async ({ page }) => {
  await page.goto("/en");

  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("body")).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("sign-in form is reachable and accessible", async ({ page }) => {
  await page.goto("/en/login");

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email address" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Password" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
});
