import { describe,expect,it } from 'vitest';
import { normalizeRoomCode } from './multiplayer';

describe('multiplayer room codes',()=>{
  it('makes pasted codes safe and consistent',()=>{
    expect(normalizeRoomCode(' ab-c 12! ')).toBe('ABC12');
    expect(normalizeRoomCode('abcdefgh')).toBe('ABCDEF');
  });

  it('preserves the six-character codes produced by the server',()=>{
    expect(normalizeRoomCode('KID7XQ')).toBe('KID7XQ');
  });
});
