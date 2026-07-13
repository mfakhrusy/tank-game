import { expect, test } from '@playwright/test';

test('a child can choose parts and launch the test yard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Snap Tank Lab' })).toBeVisible();
  await page.getByRole('button', { name: /Bonker/ }).click();
  await expect(page.getByText('Bonker', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Mover', exact: true }).click();
  await page.getByRole('button', { name: /Crawler/ }).click();
  await page.getByRole('button', { name: /Test my tank/ }).click();
  await expect(page.getByText('Smash Yard')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: /Workshop/ }).click();
  await expect(page.getByRole('heading', { name: 'Snap Tank Lab' })).toBeVisible();
});

test('surprise builds remain within the budget', async ({ page }) => {
  await page.goto('/');
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: /Surprise me/ }).click();
  const text = await page.locator('.bolt-budget').innerText();
  const match = text.match(/(\d+) \/ 10/);
  expect(Number(match?.[1])).toBeLessThanOrEqual(10);
});
