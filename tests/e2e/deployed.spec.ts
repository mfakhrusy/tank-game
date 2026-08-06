import {expect,test} from '@playwright/test';

test('the deployed solo game loads, launches, and keeps a playable frame rate',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Snap Contraption Lab'})).toBeVisible();
  await page.getByRole('button',{name:'Test this thing!'}).click();
  await expect(page.getByText('Solo Yard',{exact:true})).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(async()=>Number(await page.locator('.game-canvas').getAttribute('data-fps')),{timeout:10_000}).toBeGreaterThanOrEqual(55);
  await expect(page.getByText('HP',{exact:true})).toBeVisible();
});

test('the deployed layout remains usable on a small screen',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const launch=page.getByRole('button',{name:'Test this thing!'});
  await expect(launch).toBeVisible();
  await launch.click();
  await expect(page.getByRole('button',{name:'Workshop'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Health 90 of 90'})).toBeVisible();
});
