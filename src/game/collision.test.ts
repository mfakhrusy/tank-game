import { expect,it } from 'vitest';
import { DEFAULT_BUILD,attachPart } from './config';
import { tankOutline,blockOutline,tankBlockContact,circleOutline } from './collision';

it('does not fill empty space around a single stacked attachment',()=>{
  const build=attachPart(attachPart({...DEFAULT_BUILD,attachments:[]},'popper',0),'popper',0);
  const outline=tankOutline(build),block=blockOutline('box',58);
  expect(tankBlockContact(outline,0,0,0,block,0,115,0)).toBeNull();
  expect(tankBlockContact(outline,0,0,0,block,145,0,0)).not.toBeNull();
  expect(tankBlockContact(outline,0,0,Math.PI/2,block,0,145,0)).not.toBeNull();
});
it('uses diamond edges rather than the rectangular texture bounds',()=>{
  const diamond=blockOutline('diamond',54),circle=[circleOutline(5)];
  expect(tankBlockContact(circle,24,24,0,diamond,0,0,0)).toBeNull();
  expect(tankBlockContact(circle,28,0,0,diamond,0,0,0)).not.toBeNull();
});
it('resolves actual contact by the overlap depth, not the outer tank radius',()=>{
  const contact=tankBlockContact([circleOutline(60)],0,0,0,blockOutline('orb',42),80,0,0);
  expect(contact).not.toBeNull();
  expect(Math.hypot(contact!.x,contact!.y)).toBeLessThanOrEqual(1.01);
});
