import {expect,test} from '@playwright/test';

test('existing saved builds receive IDs and load on another computer without sharing browser storage',async({browser})=>{
  const source=await browser.newContext(),destination=await browser.newContext();
  await source.addInitScript(()=>{
    if(!localStorage.getItem('snap-tank-library-v1'))localStorage.setItem('snap-tank-library-v1',JSON.stringify([
      {id:'legacy-one',savedAt:123,build:{version:2,name:'Travel tank',color:'#47b8e8',attachments:[{uid:'travel-gun',partId:'railgun',mount:0,layer:0}]}},
      {id:'legacy-two',savedAt:124,build:{version:2,name:'Fire tank',color:'#ff982f',attachments:[{uid:'fire-gun',partId:'flamethrower',mount:2,layer:0}]}},
    ]));
  });
  const host=await source.newPage(),guest=await destination.newPage();
  await host.goto('/');await guest.goto('/');
  const library=host.getByRole('region',{name:'Saved builds'});
  await expect(library.locator('.saved-build-share code')).toHaveCount(2,{timeout:15000});
  const firstId=(await library.locator('.saved-build-share code').first().innerText()).trim();
  expect(firstId).toMatch(/^[a-z]+_[a-z]+_[a-z]+$/);
  expect(await guest.evaluate(()=>localStorage.getItem('snap-tank-library-v1'))).toBeNull();
  await guest.getByLabel('Load a build by ID').fill(firstId.replaceAll('_',' ').toUpperCase());
  await guest.getByRole('button',{name:'Load ID',exact:true}).click();
  await expect(guest.getByLabel('Contraption name')).toHaveValue('Travel tank');
  await expect(guest.getByRole('button',{name:'Swap Railgun'})).toBeVisible();
  await expect(guest.locator('.saved-build-share code')).toHaveText(firstId);
  await guest.reload();await expect(guest.getByLabel('Contraption name')).toHaveValue('Travel tank');
  await expect(guest.locator('.saved-build-share code')).toHaveText(firstId);
  await host.getByRole('button',{name:'Load Travel tank',exact:true}).click();
  await host.getByLabel('Contraption name').fill('Updated travel tank');
  await host.getByRole('button',{name:'Update Travel tank',exact:true}).click();
  await expect(library.locator('.saved-build-share code')).toHaveCount(2);
  const updatedId=(await library.locator('.saved-build-share code').first().innerText()).trim();
  expect(updatedId).not.toBe(firstId);
  const old=await host.request.get(`/api/builds/${firstId}`);expect((await old.json()).build.name).toBe('Travel tank');
  await guest.getByLabel('Load a build by ID').fill(updatedId);
  await guest.getByRole('button',{name:'Load ID',exact:true}).click();
  await expect(guest.getByLabel('Contraption name')).toHaveValue('Updated travel tank');
  await guest.setViewportSize({width:390,height:844});
  await guest.getByRole('region',{name:'Saved builds'}).scrollIntoViewIfNeeded();
  await guest.screenshot({path:'/tmp/tank-sharing-mobile.png',fullPage:true});
  await source.close();await destination.close();
});

test('build sharing validates requests, deduplicates retries, and reports missing IDs',async({request})=>{
  const build={version:2,name:'API test tank',color:'#47b8e8',attachments:[{uid:'api-gun',partId:'popper',mount:0,layer:0}]};
  const responses=await Promise.all(Array.from({length:5},()=>request.post('/api/builds',{data:build})));
  const ids=await Promise.all(responses.map(async response=>{expect(response.ok()).toBe(true);return (await response.json()).id;}));
  expect(new Set(ids).size).toBe(1);
  expect((await request.post('/api/builds',{data:{...build,attachments:[{...build.attachments[0],partId:'unknown'}]}})).status()).toBe(400);
  expect((await request.post('/api/builds',{data:'x'.repeat(17000),headers:{'Content-Type':'application/json'}})).status()).toBe(413);
  expect((await request.get('/api/builds/not_an_existingid')).status()).toBe(404);
});

test('sharing failures preserve local builds and retry assigns an ID',async({page})=>{
  let offline=true;
  await page.route('**/api/builds',route=>offline?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Build sharing is temporarily unavailable. Please try again.'})}):route.continue());
  await page.goto('/');await page.getByRole('button',{name:'Save build',exact:true}).click();
  const library=page.getByRole('region',{name:'Saved builds'});
  await expect(library.getByRole('button',{name:'Retry ID',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('snap-tank-library-v1')!)[0].build.attachments.length)).toBeGreaterThan(0);
  offline=false;await library.getByRole('button',{name:'Retry ID',exact:true}).click();
  await expect(library.locator('.saved-build-share code')).toHaveCount(1);
  await page.getByLabel('Load a build by ID').fill('not_an_existingid');
  await page.getByRole('button',{name:'Load ID',exact:true}).click();
  await expect(page.getByText('Build ID not found. Check the three words and try again.',{exact:true})).toBeVisible();
  await expect(library.locator('li')).toHaveCount(1);
});

test('saved-build uploads resume automatically after a rate-limit pause',async({page})=>{
  let calls=0;
  await page.route('**/api/builds',route=>{
    calls++;
    return calls===1?route.fulfill({status:429,headers:{'Retry-After':'1'},contentType:'application/json',body:JSON.stringify({code:'rate_limited'})}):route.continue();
  });
  await page.goto('/');await page.getByRole('button',{name:'Save build',exact:true}).click();
  await expect(page.getByText('Sharing paused; retrying automatically…',{exact:true})).toBeVisible();
  await expect(page.locator('.saved-build-share code')).toHaveCount(1,{timeout:10000});
  expect(calls).toBeGreaterThanOrEqual(2);
});
