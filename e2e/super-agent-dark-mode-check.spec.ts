import { test, expect } from '@playwright/test';

const ROUTES = [
  '/en/super-agent',
  '/en/super-agent/agents',
  '/en/super-agent/leads',
  '/en/super-agent/employers',
  '/en/super-agent/approvals',
  '/en/super-agent/placements',
  '/en/super-agent/commissions',
  '/en/super-agent/reports',
  '/en/super-agent/market',
];

test.describe('Super Agent Dark Mode Visual Check', () => {
  test.setTimeout(90000); // 90 seconds for all routes

  test('should verify dark mode rendering across all super-agent routes', async ({ page }) => {
    const results: { route: string; status: string; issues: string[] }[] = [];

    // Step 1: Navigate to login page
    console.log('🔐 Logging in as super-agent...');
    await page.goto('http://localhost:3000/en/login', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Step 2: Wait for form to be visible and fill in credentials
    await page.waitForSelector('#email', { state: 'visible' });
    await page.fill('#email', 'superagent@mployedin.com');
    await page.fill('#password', 'SuperAgent@1234');

    console.log('   Credentials entered. Submitting form...');

    // Step 3: Submit login form and wait for navigation
    const navigationPromise = page.waitForURL(/\/(super-agent|admin|employer|agent|job-seeker)/, {
      timeout: 20000,
      waitUntil: 'domcontentloaded',
    });
    
    await page.click('button[type="submit"]:has-text("Sign in")');
    
    // Wait for successful navigation away from login
    try {
      await navigationPromise;
      console.log('✅ Login successful. Waiting for page to stabilize...');
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (error) {
      // If navigation timeout, check current URL
      const currentUrl = page.url();
      console.log(`⚠️  Navigation timeout. Current URL: ${currentUrl}`);
      
      // Take screenshot for debugging
      await page.screenshot({
        path: 'test-results/super-agent-login-failure.png',
        fullPage: true,
      });

      if (currentUrl.includes('/login') || currentUrl.includes('/sign-in')) {
        console.log('❌ BLOCKER: Login failed. Still on login page.');
        console.log('   Please verify credentials or check for authentication issues.');
        console.log('   Check test-results/super-agent-login-failure.png for details.');
        return;
      }
    }

    const finalUrl = page.url();
    console.log(`✅ Authenticated. Current URL: ${finalUrl}`);

    // Take screenshot after login to verify we're authenticated
    await page.screenshot({
      path: 'test-results/super-agent-after-login.png',
      fullPage: true,
    });

    // If we can access, check each route
    for (const route of ROUTES) {
      const routeResult = {
        route,
        status: 'unknown',
        issues: [] as string[],
      };

      try {
        console.log(`\n🔍 Checking ${route}...`);
        const resp = await page.goto(`http://localhost:3000${route}`, {
          waitUntil: 'networkidle',
          timeout: 15000,
        });

        if (!resp || !resp.ok()) {
          routeResult.status = 'error';
          routeResult.issues.push(`HTTP ${resp?.status() || 'timeout'}`);
          results.push(routeResult);
          continue;
        }

        // Wait for content to load
        await page.waitForTimeout(1000);

        // Check for dark mode class on html or body
        const htmlClass = await page.locator('html').getAttribute('class');
        const bodyClass = await page.locator('body').getAttribute('class');
        const hasDarkMode = htmlClass?.includes('dark') || bodyClass?.includes('dark');

        console.log(`   Dark mode class: ${hasDarkMode ? '✅' : '❌'}`);

        // Check for light-only backgrounds (common leak patterns)
        const lightLeaks = await page.evaluate(() => {
          const issues: string[] = [];
          
          // Check for white/light backgrounds
          const elements = document.querySelectorAll('*');
          let whiteCount = 0;
          let lightGrayCount = 0;

          elements.forEach((el) => {
            const bg = window.getComputedStyle(el).backgroundColor;
            if (bg === 'rgb(255, 255, 255)') whiteCount++;
            if (bg.match(/rgb\(2[4-5][0-9], 2[4-5][0-9], 2[4-5][0-9]\)/)) lightGrayCount++;
          });

          if (whiteCount > 10) issues.push(`${whiteCount} elements with white bg`);
          if (lightGrayCount > 10) issues.push(`${lightGrayCount} elements with light gray bg`);

          // Check for common UI elements that should be dark
          const cards = document.querySelectorAll('[class*="card"], [class*="Card"]');
          const tables = document.querySelectorAll('table');
          const inputs = document.querySelectorAll('input, textarea');
          const chips = document.querySelectorAll('[class*="badge"], [class*="chip"], [class*="tag"]');

          return {
            issues,
            counts: {
              cards: cards.length,
              tables: tables.length,
              inputs: inputs.length,
              chips: chips.length,
            },
          };
        });

        if (lightLeaks.issues.length > 0) {
          routeResult.issues.push(...lightLeaks.issues);
        }

        console.log(`   Cards: ${lightLeaks.counts.cards}, Tables: ${lightLeaks.counts.tables}, Inputs: ${lightLeaks.counts.inputs}, Chips: ${lightLeaks.counts.chips}`);

        // Take screenshot
        const screenshotPath = `test-results/super-agent-${route.replace(/\//g, '-')}.png`;
        await page.screenshot({
          path: screenshotPath,
          fullPage: true,
        });

        routeResult.status = lightLeaks.issues.length > 0 ? 'issues-found' : 'passed';
        console.log(`   Status: ${routeResult.status}`);

      } catch (error) {
        routeResult.status = 'error';
        routeResult.issues.push((error as Error).message);
        console.log(`   ❌ Error: ${(error as Error).message}`);
      }

      results.push(routeResult);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('VISUAL CHECK SUMMARY');
    console.log('='.repeat(60));

    const passed = results.filter(r => r.status === 'passed');
    const withIssues = results.filter(r => r.status === 'issues-found');
    const errors = results.filter(r => r.status === 'error');

    console.log(`✅ Passed: ${passed.length}/${ROUTES.length}`);
    console.log(`⚠️  Issues found: ${withIssues.length}/${ROUTES.length}`);
    console.log(`❌ Errors: ${errors.length}/${ROUTES.length}`);

    if (withIssues.length > 0) {
      console.log('\nROUTES WITH VISUAL ISSUES:');
      withIssues.forEach(r => {
        console.log(`  ${r.route}:`);
        r.issues.forEach(i => console.log(`    - ${i}`));
      });
    }

    if (errors.length > 0) {
      console.log('\nROUTES WITH ERRORS:');
      errors.forEach(r => {
        console.log(`  ${r.route}: ${r.issues.join(', ')}`);
      });
    }

    // Write results to JSON
    await page.context().browser()?.close();
  });
});
