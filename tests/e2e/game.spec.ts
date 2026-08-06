import { expect, test } from '@playwright/test';

test('a child can stack two different parts on one socket and launch', async ({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Clear'}).click();
  await page.getByRole('button',{name:/Popper/}).click();
  await page.getByRole('button',{name:'Socket 1, 0 of 2 layers'}).click();
  await page.getByRole('button',{name:'Movers'}).click();
  await page.getByRole('button',{name:/Zippy Wheel/}).click();
  await page.getByRole('button',{name:'Socket 1, 1 of 2 layers'}).click();
  await expect(page.getByRole('button',{name:'Socket 1, 2 of 2 layers'})).toBeVisible();
  await page.getByRole('button',{name:/Test this thing/}).click();
  await expect(page.getByText('Solo Yard')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
});

test('wild builds report complexity without imposing a cap',async({page})=>{
  await page.goto('/');
  for(let i=0;i<8;i++)await page.getByRole('button',{name:/Wild build/}).click();
  const text=await page.locator('.bolt-budget').innerText();
  expect(text).toContain('No limit');
  expect(text).not.toContain('/ 18');
  await expect(page.locator('.attached-chip')).not.toHaveCount(0);
});

test('an attached mover can be swapped in place',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Clear'}).click();
  await page.getByRole('button',{name:'Movers'}).click();
  await page.getByRole('button',{name:/Zippy Wheel/}).click();
  await page.getByRole('button',{name:'Socket 4, 0 of 2 layers'}).click();
  await page.getByRole('button',{name:'Swap Zippy Wheel'}).click();
  await expect(page.getByText('SWAP MODE')).toBeVisible();
  await page.getByRole('button',{name:/Crawler Foot/}).click();
  await expect(page.getByRole('button',{name:'Swap Crawler Foot'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Swap Zippy Wheel'})).toHaveCount(0);
});

test('rear boosters can be stacked on the back socket',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Clear'}).click();
  await page.getByRole('button',{name:'Movers'}).click();
  await page.getByRole('button',{name:/Back Booster/}).click();
  await page.getByRole('button',{name:'Socket 5, 0 of 2 layers'}).click();
  await page.getByRole('button',{name:/Twin Booster/}).click();
  await page.getByRole('button',{name:'Socket 5, 1 of 2 layers'}).click();
  await expect(page.getByRole('button',{name:'Socket 5, 2 of 2 layers'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Swap Back Booster'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Swap Twin Booster'})).toBeVisible();
});

test('the boomerang launcher fires real projectiles in the yard',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Clear'}).click();
  await page.getByRole('button',{name:/Boomerang/}).click();
  await page.getByRole('button',{name:'Socket 1, 0 of 2 layers'}).click();
  await page.getByRole('button',{name:/Test this thing/}).click();
  const canvas=page.locator('canvas');await expect(canvas).toBeVisible();
  const box=await canvas.boundingBox();expect(box).not.toBeNull();
  await page.mouse.move(box!.x+box!.width*.8,box!.y+box!.height*.5);
  await page.mouse.down();await page.waitForTimeout(900);await page.mouse.up();
  const shots=page.locator('.score-card > div').filter({hasText:'Shots'}).locator('strong');
  await expect(shots).not.toHaveText('0');
});

test('the endless yard keeps tracking travel away from the start',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Clear'}).click();
  await page.getByRole('button',{name:/Popper/}).click();
  await page.getByRole('button',{name:'Socket 1, 0 of 2 layers'}).click();
  await page.getByRole('button',{name:/Test this thing/}).click();
  await page.keyboard.down('d');await page.waitForTimeout(1700);await page.keyboard.up('d');
  await expect(page.locator('.distance-value')).not.toHaveText('0m');
  await expect(page.getByText('Solo Yard')).toBeVisible();
});

test('crashing into a block damages both the contraption and the block',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Clear'}).click();
  await page.getByRole('button',{name:'Shields'}).click();
  await page.getByRole('button',{name:/Spike Crown/}).click();
  await page.getByRole('button',{name:'Socket 1, 0 of 2 layers'}).click();
  await page.getByRole('button',{name:/Test this thing/}).click();
  const hp=page.locator('.hp-card');await expect(hp).toContainText('88 / 88');
  await page.keyboard.down('d');await page.waitForTimeout(3500);await page.keyboard.up('d');
  await expect(hp).not.toContainText('88 / 88');
  const damagedHealth=Number(((await hp.locator('span').textContent())??'0').split('/')[0].trim());
  const smashed=page.locator('.score-card > div').filter({hasText:'Blocks'}).locator('strong');
  await expect(smashed).toHaveText('1');
  await expect.poll(async()=>Number(((await hp.locator('span').textContent())??'0').split('/')[0].trim()),{timeout:6500}).toBeGreaterThan(damagedHealth);
});

test('right click stays inside the game instead of opening the browser menu',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:/Test this thing/}).click();
  const prevented=await page.locator('.yard-screen').evaluate(element=>{
    const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2});
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
});

test('the yard can zoom out to reveal more of the world',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:/Test this thing/}).click();
  const zoom=page.getByRole('status');
  await expect(zoom).toHaveText('100%');
  for(let i=0;i<5;i++)await page.getByRole('button',{name:'Zoom out'}).click();
  await expect(zoom).toHaveText('55%');
  await expect(page.getByRole('button',{name:'Zoom out'})).toBeDisabled();
  await page.locator('.yard-screen').dispatchEvent('wheel',{deltaY:-100});
  await expect(zoom).toHaveText('65%');
  await expect(page.locator('canvas')).toBeVisible();
});

test('sixteen sprinklers can fire continuously without freezing the yard',async({page})=>{
  const pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto('/');
  await page.getByRole('button',{name:'Clear'}).click();
  await page.getByRole('button',{name:/Sprinkler/}).click();
  for(let socket=1;socket<=8;socket++){
    await page.getByRole('button',{name:`Socket ${socket}, 0 of 2 layers`}).click();
    await page.getByRole('button',{name:`Socket ${socket}, 1 of 2 layers`}).click();
  }
  await page.getByRole('button',{name:/Test this thing/}).click();
  const canvas=page.locator('canvas');const box=await canvas.boundingBox();expect(box).not.toBeNull();
  await page.waitForTimeout(1200);
  const idleFps=Number(await page.locator('.game-canvas').getAttribute('data-fps'));
  await page.mouse.move(box!.x+box!.width*.8,box!.y+box!.height*.5);
  await page.mouse.down();await page.waitForTimeout(3200);await page.mouse.up();
  await expect(page.getByRole('button',{name:'Workshop'})).toBeVisible();
  const shots=Number(await page.locator('.score-card > div').filter({hasText:'Shots'}).locator('strong').textContent());
  const measuredFps=Number(await page.locator('.game-canvas').getAttribute('data-fps'));
  const projectileBudget=Number(await page.locator('.game-canvas').getAttribute('data-projectile-budget'));
  expect(shots).toBeGreaterThan(40);
  expect(measuredFps).toBeGreaterThan(15);
  expect(idleFps).toBeGreaterThan(0);
  expect(projectileBudget).toBeLessThanOrEqual(120);
  expect(pageErrors).toEqual([]);
});
