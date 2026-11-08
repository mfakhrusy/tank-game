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

test('multiplayer projectiles travel smoothly between server snapshots',async({page})=>{
  await page.route('**/src/game/TestScene.ts*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+`
      const renderNetwork=TestScene.prototype.updateNetworkEntities;
      TestScene.prototype.updateNetworkEntities=function(){
        renderNetwork.call(this);
        const now=performance.now(),frame=this.networkMotion.sample(now);
        if(!frame)return;
        this.motionSamples??=new Map();window.__shotSpeeds??=[];
        for(const [id,entry] of this.networkProjectiles){
          const previous=this.motionSamples.get(id),p=entry.image;
          const stable=frame.from.projectiles.has(id)&&frame.to.projectiles.has(id)&&frame.from!==frame.to;
          if(previous&&stable&&previous.stable&&now-previous.born>150&&now-previous.time<40){
            window.__shotSpeeds.push(Math.hypot(p.x-previous.x,p.y-previous.y)*1000/(now-previous.time));
          }
          this.motionSamples.set(id,{x:p.x,y:p.y,time:now,born:previous?.born??now,stable});
        }
      };
    `});
  });
  await page.goto('/');
  await page.getByRole('button',{name:/Test this thing/}).click();
  await page.getByRole('button',{name:'Create a room',exact:true}).click();
  await expect(page.getByText('1 player connected')).toBeVisible();
  await page.getByRole('button',{name:/Auto shoot/}).click();
  await page.mouse.move(1100,360);
  await page.waitForTimeout(2500);
  await page.getByRole('button',{name:/Auto shoot/}).click();
  const speeds=await page.evaluate(()=>(window as any).__shotSpeeds as number[]);
  expect(speeds.length).toBeGreaterThan(30);
  speeds.sort((a,b)=>a-b);
  const p05=speeds[Math.floor(speeds.length*.05)],p95=speeds[Math.floor(speeds.length*.95)];
  expect(p05).toBeGreaterThan(350);
  expect(p95/p05).toBeLessThan(1.3);
  await page.getByRole('button',{name:'Leave room',exact:true}).click();
});

test('a multiplayer tank stops at a visible shape and receives server contact damage',async({page})=>{
  await page.route('**/src/game/TestScene.ts*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+`
      const originalCreate=TestScene.prototype.create;
      TestScene.prototype.create=function(){originalCreate.call(this);window.__collisionScene=this;};
    `});
  });
  await page.goto('/');
  await page.getByRole('button',{name:/Test this thing/}).click();
  await page.getByRole('button',{name:'Create a room',exact:true}).click();
  await expect(page.getByText('1 player connected')).toBeVisible();
  await page.waitForFunction(()=>{
    const scene=(window as any).__collisionScene;
    return scene&&[...scene.networkEnemies.values()].some((enemy:any)=>/enemy-(chunk|honey|loaf)-/.test(String(enemy.image.frame.name)));
  });
  const fullHealth=await page.locator('.hp-card span').textContent();
  await page.evaluate(()=>{
    const scene=(window as any).__collisionScene;
    const enemy=[...scene.networkEnemies.values()].find((enemy:any)=>/enemy-(chunk|honey|loaf)-/.test(String(enemy.image.frame.name))) as any;
    (window as any).__contactTarget=enemy.image;
    (scene.tank.body as any).reset(enemy.image.x-170,enemy.image.y);
    scene.input.activePointer.positionToCamera=()=>({x:scene.tank.x+1000,y:scene.tank.y});
  });
  await page.keyboard.down('d');await page.waitForTimeout(1300);await page.keyboard.up('d');
  await expect(page.locator('.hp-card span')).not.toHaveText(fullHealth!,{timeout:3000});
  const distance=await page.evaluate(()=>{
    const scene=(window as any).__collisionScene,enemy=(window as any).__contactTarget;
    return enemy.x-scene.tank.x;
  });
  expect(distance).toBeGreaterThan(90);
  expect(distance).toBeLessThan(170);
  await page.getByRole('button',{name:'Leave room',exact:true}).click();
});

test('multiplayer renders the authoritative railgun beam',async({page})=>{
  await page.route('**/src/game/TestScene.ts*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+`
      const render=TestScene.prototype.syncNetworkProjectiles;
      TestScene.prototype.syncNetworkProjectiles=function(frame){
        render.call(this,frame);
        for(const entry of this.networkProjectiles.values()){
          if(entry.image.texture.key==='rail-beam')window.__railBeamWidth=entry.image.displayWidth;
        }
      };
    `});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Clear',exact:true}).click();
  await page.getByRole('button',{name:/Railgun/}).click();
  await page.getByRole('button',{name:'Socket 1, 0 of 2 layers'}).click();
  await page.getByRole('button',{name:/Test this thing/}).click();
  await page.getByRole('button',{name:'Create a room',exact:true}).click();
  await expect(page.getByText('1 player connected')).toBeVisible();
  await page.getByRole('button',{name:/Auto shoot/}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__railBeamWidth)).toBe(1100);
  await page.getByRole('button',{name:/Auto shoot/}).click();
  await page.getByRole('button',{name:'Leave room',exact:true}).click();
});

test('creating a room at capacity shows a helpful error and allows retry',async({page})=>{
  await page.route('**/api/rooms',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'room_limit_reached'})}));
  await page.goto('/');
  await page.getByRole('button',{name:/Test this thing/}).click();
  const create=page.getByRole('button',{name:'Create a room',exact:true});
  await create.click();
  await expect(page.getByText('The server is full (10 rooms maximum). Join an existing room or try again later.',{exact:true})).toBeVisible();
  await expect(create).toBeEnabled();
  await expect(page.getByLabel('Room code')).toBeEnabled();
});

test('multiplayer flame streams ignite enemies and render their replicated burning state',async({page})=>{
  await page.route('**/src/game/TestScene.ts*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+`
      const create=TestScene.prototype.create,render=TestScene.prototype.syncNetworkEnemies;
      TestScene.prototype.create=function(){create.call(this);window.__networkFlameScene=this;};
      TestScene.prototype.syncNetworkEnemies=function(frame){render.call(this,frame);if([...frame.from.enemies.values()].some(e=>e.burning))window.__burningSeen=true;};
    `});
  });
  await page.goto('/');await page.getByRole('button',{name:'Clear',exact:true}).click();
  await page.getByRole('button',{name:/Flamethrower/}).click();
  await page.getByRole('button',{name:'Socket 1, 0 of 2 layers'}).click();
  await page.getByRole('button',{name:/Test this thing/}).click();
  await page.getByRole('button',{name:'Create a room',exact:true}).click();
  await expect(page.getByText('1 player connected')).toBeVisible();
  await page.waitForFunction(()=>[...(window as any).__networkFlameScene.networkEnemies.values()].some((e:any)=>String(e.image.frame.name).includes('chunk')));
  await page.evaluate(()=>{
    const scene=(window as any).__networkFlameScene;
    const enemy=[...scene.networkEnemies.values()].find((e:any)=>String(e.image.frame.name).includes('chunk')) as any;
    scene.tank.body.reset(enemy.image.x-210,enemy.image.y);
    scene.input.activePointer.positionToCamera=()=>({x:enemy.image.x+500,y:enemy.image.y});
  });
  await page.getByRole('button',{name:/Auto shoot/}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__burningSeen)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).__networkFlameScene.fireVisualCount)).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Leave room',exact:true}).click();
});
