import { expect,test } from '@playwright/test';

test.describe.configure({timeout:60_000});

test('two browser clients can share a room and cleanly leave',async({browser})=>{
  const hostContext=await browser.newContext(),guestContext=await browser.newContext();
  const host=await hostContext.newPage(),guest=await guestContext.newPage();
  await host.goto('/');await guest.goto('/');
  await host.getByRole('button',{name:/Test this thing/}).click();
  await guest.getByRole('button',{name:/Test this thing/}).click();
  await host.getByRole('button',{name:'Create a room'}).click();
  await expect(host.getByText('1 player connected')).toBeVisible();
  const room=(await host.locator('.room-code b').innerText()).trim();
  expect(room).toMatch(/^[A-Z2-9]{6}$/);
  await guest.getByLabel('Room code').fill(room);
  await guest.getByRole('button',{name:'Join',exact:true}).click();
  await expect(host.getByText('2 players connected')).toBeVisible();
  await expect(guest.getByText('2 players connected')).toBeVisible();
  await expect(host.locator('.game-canvas')).toHaveAttribute('data-remote-players','1');
  await expect(guest.locator('.game-canvas')).toHaveAttribute('data-remote-players','1');
  await expect(host.getByText('Co-op Yard')).toBeVisible();
  await expect.poll(async()=>Number(await host.locator('.game-canvas').getAttribute('data-network-enemies'))).toBeGreaterThan(20);
  await expect.poll(async()=>await guest.locator('.game-canvas').getAttribute('data-network-enemy-ids')).toBe(await host.locator('.game-canvas').getAttribute('data-network-enemy-ids'));
  const canvas=host.locator('canvas'),box=await canvas.boundingBox();expect(box).not.toBeNull();
  await host.mouse.move(box!.x+box!.width*.8,box!.y+box!.height*.5);await host.mouse.down();
  await expect.poll(async()=>Number(await guest.locator('.game-canvas').getAttribute('data-network-projectiles'))).toBeGreaterThan(0);
  await host.mouse.up();
  const hostShots=host.locator('.score-card > div').filter({hasText:'Shots'}).locator('strong');
  const guestShots=guest.locator('.score-card > div').filter({hasText:'Shots'}).locator('strong');
  await expect(hostShots).not.toHaveText('0');await expect(guestShots).toHaveText(await hostShots.innerText());
  await guest.getByRole('button',{name:'Leave room'}).click();
  await expect(host.getByText('1 player connected')).toBeVisible();
  await expect(host.locator('.game-canvas')).toHaveAttribute('data-remote-players','0');
  await expect(guest.getByText('Solo Yard')).toBeVisible();
  await expect(guest.locator('.game-canvas')).toHaveAttribute('data-network-enemies','0');
  await hostContext.close();await guestContext.close();
});

test('a made-up room code gives a friendly error',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:/Test this thing/}).click();
  await page.getByLabel('Room code').fill('ABC123');
  await page.getByRole('button',{name:'Join',exact:true}).click();
  await expect(page.getByText('Room not found or the server is unavailable.')).toBeVisible();
});
