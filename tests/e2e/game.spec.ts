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

test('ramming damages the tank without one-shotting a fresh block',async({page})=>{
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
  await expect(smashed).toHaveText('0');
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

test('a magnet keeps a safe gap while the vehicle is parked',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Clear',exact:true}).click();
  await page.getByRole('button',{name:'Weird stuff',exact:true}).click();
  await page.getByRole('button',{name:/Block Magnet/}).click();
  await page.getByRole('button',{name:'Socket 1, 0 of 2 layers'}).click();
  await page.getByRole('button',{name:/Test this thing/}).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(5000);
  await expect(page.locator('.hp-card')).toContainText('70 / 70');
});

test('automatic controls toggle independently and auto shoot stops when disabled',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:/Test this thing/}).click();
  const spin=page.getByRole('button',{name:/Auto spin/}),shoot=page.getByRole('button',{name:/Auto shoot/});
  await expect(spin).toHaveAttribute('aria-pressed','false');
  await expect(shoot).toHaveAttribute('aria-pressed','false');
  await spin.click();await expect(spin).toHaveAttribute('aria-pressed','true');
  await expect(shoot).toHaveAttribute('aria-pressed','false');
  await shoot.click();await expect(shoot).toHaveAttribute('aria-pressed','true');
  const shots=page.locator('.score-card > div').filter({hasText:'Shots'}).locator('strong');
  await page.mouse.move(5,5);
  await expect.poll(async()=>Number(await shots.textContent())).toBeGreaterThan(2);
  await shoot.click();await expect(shoot).toHaveAttribute('aria-pressed','false');
  await page.waitForTimeout(250);
  const stopped=await shots.textContent();
  await page.waitForTimeout(700);await expect(shots).toHaveText(stopped!);
  await spin.click();await expect(spin).toHaveAttribute('aria-pressed','false');
});

test('multiple saved builds survive reload and can be loaded, updated, and deleted',async({page})=>{
  await page.goto('/');
  const name=page.getByLabel('Contraption name'),library=page.getByRole('region',{name:'Saved builds'});
  await name.fill('Blue tank');await library.getByRole('button',{name:'Save build',exact:true}).click();
  await page.getByRole('button',{name:'Clear',exact:true}).click();
  await name.fill('Empty tank');await library.getByRole('button',{name:'Save build',exact:true}).click();
  await page.reload();
  await expect(library.locator('li')).toHaveCount(2);
  await library.getByRole('button',{name:'Load Blue tank',exact:true}).click();
  await expect(name).toHaveValue('Blue tank');
  await expect(page.locator('.attached-chip')).toHaveCount(4);
  await name.fill('Blue tank revised');
  await library.getByRole('button',{name:'Update Blue tank',exact:true}).click();
  await library.getByRole('button',{name:'Load Empty tank',exact:true}).click();
  await expect(page.locator('.attached-chip')).toHaveCount(0);
  await library.getByRole('button',{name:'Load Blue tank revised',exact:true}).click();
  await expect(name).toHaveValue('Blue tank revised');
  await expect(page.locator('.attached-chip')).toHaveCount(4);
  await library.getByRole('button',{name:'Delete Empty tank',exact:true}).click();
  await page.reload();await expect(library.locator('li')).toHaveCount(1);
  await expect(name).toHaveValue('Blue tank revised');
});


test('a real smasher collision leaves the weak block alive and visibly knocks it away',async({page})=>{
  await page.route('**/src/game/TestScene.ts*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+`
      const originalCreate=TestScene.prototype.create;
      TestScene.prototype.create=function(){originalCreate.call(this);window.__knockbackScene=this;};
    `});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Clear',exact:true}).click();
  await page.getByRole('button',{name:'Shields',exact:true}).click();
  await page.getByRole('button',{name:/Spike Crown/}).click();
  await page.getByRole('button',{name:'Socket 1, 0 of 2 layers'}).click();
  await page.getByRole('button',{name:/Test this thing/}).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(()=>!!(window as any).__knockbackScene);
  await page.evaluate(()=>{
    const scene=(window as any).__knockbackScene;
    const target=scene.staticBlocks.getChildren().find((block:any)=>block.x===260&&block.y===0);
    (window as any).__knockbackTarget=target;
    for(const group of [scene.blocks,scene.staticBlocks])for(const block of [...group.getChildren()])if(block!==target)block.destroy();
  });
  await page.mouse.move(1100,360);
  await page.keyboard.down('d');
  await expect.poll(()=>page.evaluate(()=>{
    const target=(window as any).__knockbackTarget;
    return target.active&&target.x>280&&target.hp<target.maxHp;
  }),{timeout:6000}).toBe(true);
  await page.keyboard.up('d');
});

test('a smasher can knock one shape into another and reveal both health bars',async({page})=>{
  await page.route('**/src/game/TestScene.ts*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+`
      const originalCreate=TestScene.prototype.create;
      TestScene.prototype.create=function(){originalCreate.call(this);window.__shapeScene=this;};
    `});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Clear',exact:true}).click();
  await page.getByRole('button',{name:'Shields',exact:true}).click();
  await page.getByRole('button',{name:/Spike Crown/}).click();
  await page.getByRole('button',{name:'Socket 1, 0 of 2 layers'}).click();
  await page.getByRole('button',{name:/Test this thing/}).click();
  await page.waitForFunction(()=>!!(window as any).__shapeScene);
  await page.evaluate(()=>{
    const scene=(window as any).__shapeScene;
    const target=scene.staticBlocks.getChildren().find((block:any)=>block.x===260&&block.y===0);
    for(const group of [scene.blocks,scene.staticBlocks])for(const block of [...group.getChildren()])if(block!==target)block.destroy();
    (window as any).__firstShape=target;
    (window as any).__secondShape=scene.createBlock(326,0,0);
  });
  await page.mouse.move(1100,360);await page.keyboard.down('d');
  await expect.poll(()=>page.evaluate(()=>(window as any).__firstShape.hp<(window as any).__firstShape.maxHp),{timeout:6000}).toBe(true);
  await page.keyboard.up('d');
  await expect.poll(()=>page.evaluate(()=>{
    const scene=(window as any).__shapeScene,b=(window as any).__secondShape;
    return b.active&&b.hp<b.maxHp&&b.x>331&&scene.healthBars.get(b)?.visible&&scene.healthBars.get((window as any).__firstShape)?.visible;
  }),{timeout:4000}).toBe(true);
});
