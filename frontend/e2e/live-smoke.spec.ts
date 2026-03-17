import { expect, test } from '@playwright/test';

const livePaperId = process.env.PLAYWRIGHT_LIVE_PAPER_ID;

test.describe('live smoke', () => {
  test.skip(!livePaperId, 'Set PLAYWRIGHT_LIVE_PAPER_ID to run live smoke checks.');

  test('loads a live seed workspace without a fatal rendering failure', async ({ page }) => {
    await page.goto(`/explore/seed?paper_id=${encodeURIComponent(livePaperId as string)}`);

    await expect(page.getByTestId('graph-status-strip')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/visualization error/i)).toHaveCount(0);

    await page.screenshot({
      path: test.info().outputPath('live-seed-smoke.png'),
      fullPage: true,
    });
  });
});
