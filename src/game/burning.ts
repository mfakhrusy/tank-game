export const BURN_DURATION_MS=3000,BURN_TICK_MS=250;
export type Burn={until:number;nextTick:number;damage:number};
// Refresh duration and retain the strongest flame; never postpone an existing tick.
export function igniteBurn(current:Burn|undefined,now:number,damage:number):Burn {
  return {until:now+BURN_DURATION_MS,nextTick:current&&current.until>=now?current.nextTick:now+BURN_TICK_MS,damage:Math.max(damage,current&&current.until>=now?current.damage:0)};
}
export function tickBurn(current:Burn,now:number):{damage:number;burn:Burn|null}{
  const count=Math.max(0,Math.floor((Math.min(now,current.until)-current.nextTick)/BURN_TICK_MS)+1);
  const next={...current,nextTick:current.nextTick+count*BURN_TICK_MS};
  return {damage:count*current.damage,burn:now>=current.until?null:next};
}
