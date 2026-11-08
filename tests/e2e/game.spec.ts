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

test('a full build can remove modules directly from its preview and undo without horizontal scrolling',async({page})=>{
  await page.addInitScript(()=>{if(!localStorage.getItem('snap-tank-build-v2'))localStorage.setItem('snap-tank-build-v2',JSON.stringify({version:2,state:{build:{version:2,name:'Full tank',color:'#5b7cfa',attachments:Array.from({length:16},(_,i)=>({uid:`module-${i}`,partId:'popper',mount:Math.floor(i/2),layer:i%2}))}}}));});
  await page.goto('/');
  await expect(page.locator('.attached-chip')).toHaveCount(16);
  const inventory=page.locator('.module-grid');
  expect(await inventory.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.getByRole('button',{name:'Remove parts',exact:true}).click();
  const module=page.getByRole('button',{name:'Remove Popper, socket 8, outer layer',exact:true});
  await module.focus();await module.press('Enter');
  await expect(page.locator('.attached-chip')).toHaveCount(15);
  await expect(page.getByRole('button',{name:'Undo remove',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Undo remove',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Undo remove',exact:true}).click();
  await expect(page.locator('.attached-chip')).toHaveCount(16);
  const socket=page.getByRole('region',{name:'Socket 8 modules',exact:true});
  await socket.locator('.attached-chip').filter({hasText:'Outer layer'}).getByRole('button',{name:'Remove Popper',exact:true}).click();
  await expect(socket.locator('.attached-chip')).toHaveCount(1);
  await expect(socket).toContainText('Inner layer');
  await page.reload();await expect(page.locator('.attached-chip')).toHaveCount(15);
});

test('module removal stays usable on mobile and selecting a new part returns to add mode',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.getByRole('button',{name:'Remove parts',exact:true}).click();
  await page.getByRole('button',{name:'Remove Popper, socket 1, inner layer',exact:true}).click();
  await expect(page.locator('.attached-chip')).toHaveCount(3);
  await page.getByRole('button',{name:'Undo remove',exact:true}).click();
  await page.locator('.parts-panel').getByRole('button',{name:/Popper/}).click();
  await expect(page.getByRole('button',{name:'Add & swap',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'Socket 1, 1 of 2 layers',exact:true})).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect(await page.locator('.module-grid').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});

test('railgun pierces aligned shapes once and leaves nearby misses untouched',async({page})=>{
  await page.route('**/src/game/TestScene.ts*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+`
      const originalCreate=TestScene.prototype.create;
      TestScene.prototype.create=function(){originalCreate.call(this);window.__railScene=this;};
    `});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Clear',exact:true}).click();
  await page.getByRole('button',{name:/Railgun/}).click();
  await page.getByRole('button',{name:'Socket 1, 0 of 2 layers'}).click();
  await page.getByRole('button',{name:/Test this thing/}).click();
  await page.waitForFunction(()=>!!(window as any).__railScene);
  await page.evaluate(()=>{
    const scene=(window as any).__railScene;
    for(const group of [scene.blocks,scene.staticBlocks])for(const block of [...group.getChildren()])block.destroy();
    scene.tank.body.reset(0,0);
    scene.input.activePointer.positionToCamera=()=>({x:1000,y:0});
    (window as any).__railTargets=[[300,0],[600,0],[450,80],[1300,0]].map(([x,y])=>{
      const block=scene.createBlock(x,y,0,1);block.hp=block.maxHp=100;return block;
    });
    const show=scene.showRailBeam.bind(scene);
    scene.showRailBeam=(...args:any[])=>{show(...args);(window as any).__beamSeen=true;};
  });
  await page.mouse.down();
  await expect.poll(()=>page.evaluate(()=>(window as any).__beamSeen)).toBe(true);
  await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>(window as any).__railTargets.map((b:any)=>b.hp))).toEqual([58,58,100,100]);
  await page.waitForTimeout(250);
  expect(await page.evaluate(()=>(window as any).__railTargets.map((b:any)=>b.hp))).toEqual([58,58,100,100]);
});

test('auto spinning railguns fire along the barrel from the actual outer muzzle',async({page})=>{
  await page.route('**/src/game/TestScene.ts*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+`
      const show=TestScene.prototype.showRailBeam;
      TestScene.prototype.showRailBeam=function(x,y,angle,length){
        window.__railAngles??=[];
        window.__railAngles.push({angle,tankAngle:this.machine.rotation,radius:Math.hypot(x-this.tank.x,y-this.tank.y),originAngle:Math.atan2(y-this.tank.y,x-this.tank.x)});
        show.call(this,x,y,angle,length);
      };
    `});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Clear',exact:true}).click();
  await page.getByRole('button',{name:/Railgun/}).click();
  await page.getByRole('button',{name:'Socket 3, 0 of 2 layers'}).click();
  await page.getByRole('button',{name:'Socket 3, 1 of 2 layers'}).click();
  await page.getByRole('button',{name:/Test this thing/}).click();
  await page.getByRole('button',{name:/Auto spin/}).click();
  await page.getByRole('button',{name:/Auto shoot/}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__railAngles?.length??0)).toBeGreaterThanOrEqual(4);
  const shots=await page.evaluate(()=>(window as any).__railAngles as {angle:number;tankAngle:number;radius:number;originAngle:number}[]);
  for(const shot of shots){
    expect(Math.sin(shot.angle-shot.tankAngle-Math.PI/2)).toBeCloseTo(0,6);
    expect(Math.cos(shot.angle-shot.originAngle)).toBeCloseTo(1,6);
    expect(Math.min(Math.abs(shot.radius-110),Math.abs(shot.radius-146.24))).toBeLessThan(.001);
  }
  expect(Math.abs(shots[2].tankAngle-shots[0].tankAngle)).toBeGreaterThan(.5);
});

test('destroying shapes earns levels, hull upgrades apply, and each run starts fresh',async({page})=>{
  await page.route('**/src/game/TestScene.ts*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+`
      const create=TestScene.prototype.create;
      TestScene.prototype.create=function(){create.call(this);window.__progressScene=this;};
    `});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Clear',exact:true}).click();
  await page.getByRole('button',{name:/Railgun/}).click();
  await page.getByRole('button',{name:'Socket 1, 0 of 2 layers'}).click();
  await page.getByRole('button',{name:/Test this thing/}).click();
  await expect(page.getByText('Level 1',{exact:true})).toBeVisible();
  await page.waitForFunction(()=>!!(window as any).__progressScene);
  await page.evaluate(()=>{
    const scene=(window as any).__progressScene;
    for(const group of [scene.blocks,scene.staticBlocks])for(const b of [...group.getChildren()])b.destroy();
    scene.tank.body.reset(0,0);
    scene.input.activePointer.positionToCamera=()=>({x:1000,y:0});
    for(const x of [300,500,700])scene.createBlock(x,0,0,1).hp=1;
  });
  await page.getByRole('button',{name:/Auto shoot/}).click();
  await expect(page.getByText('Level 2',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Auto shoot/}).click();
  await page.getByRole('button',{name:/Upgrades/}).click();
  await page.getByRole('button',{name:'Upgrade Hull strength',exact:true}).click();
  await expect(page.getByRole('region',{name:'Health 81 of 81'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Upgrade Shot power',exact:true})).toBeDisabled();
  await page.screenshot({path:'/tmp/tank-progression-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('button',{name:'Upgrade Hull strength',exact:true})).toBeVisible();
  await page.screenshot({path:'/tmp/tank-progression-mobile.png'});
  await page.evaluate(()=>(window as any).__progressScene.knockOut());
  await expect(page.getByText('Level 1',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Health 70 of 70'})).toBeVisible();
  await page.getByRole('button',{name:'Workshop',exact:true}).click();
  await page.getByRole('button',{name:/Test this thing/}).click();
  await expect(page.getByText('Level 1',{exact:true})).toBeVisible();
});
