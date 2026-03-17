import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const reviewLoopConfigPath = '/tmp/scholargraph3d-review-loop.json';
const reviewLoopConfig = existsSync(reviewLoopConfigPath)
  ? JSON.parse(readFileSync(reviewLoopConfigPath, 'utf8'))
  : {};
const fixtureSlug = reviewLoopConfig.fixture || 'transformer-review';
const reviewUrl = `/explore/seed?fixture=${fixtureSlug}`;

test.describe('review fixture mode', () => {
  test('supports detail, expand, and gap review flow', async ({ page }, testInfo) => {
    await page.goto(reviewUrl);

    await expect(page.getByTestId('review-dock')).toBeVisible();
    await expect(page.getByText('Transformer Review Workspace')).toBeVisible();
    await expect(page.getByText('6').first()).toBeVisible();

    await page.screenshot({
      path: testInfo.outputPath('review-initial.png'),
      fullPage: true,
    });

    await page.getByTestId('review-open-seed').click();
    await expect(page.getByRole('heading', { name: 'Attention Is All You Need' })).toBeVisible();
    await expect(page.getByText('TOP 10% CITED')).toBeVisible();
    await expect(page.getByTestId('expand-preview')).toBeVisible();
    await expect(page.getByText(/references already here/i)).toBeVisible();

    await page.screenshot({
      path: testInfo.outputPath('review-seed-detail.png'),
      fullPage: true,
    });

    await page.getByTestId('review-expand-seed').click();
    await expect(page.getByTestId('expand-summary')).toBeVisible();
    await expect(page.getByText(/\+2 papers/i)).toBeVisible();
    await expect(page.getByText(/expand complete|second seed merged/i)).toBeVisible();

    await page.screenshot({
      path: testInfo.outputPath('review-after-expand.png'),
      fullPage: true,
    });

    await page.getByTestId('review-open-gaps').click();
    await expect(page.getByText(/research gap/i)).toBeVisible();
    await expect(page.getByText(/protein design workflows/i)).toBeVisible();

    await page.screenshot({
      path: testInfo.outputPath('review-gaps.png'),
      fullPage: true,
    });
  });
});
