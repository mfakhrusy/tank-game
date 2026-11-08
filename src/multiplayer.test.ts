import { describe,expect,it } from 'vitest';
import { multiplayerEndpoint, normalizeRoomCode } from './multiplayer';

describe('multiplayer room codes',()=>{
  it('makes pasted codes safe and consistent',()=>{
    expect(normalizeRoomCode(' ab-c 12! ')).toBe('ABC12');
    expect(normalizeRoomCode('abcdefgh')).toBe('ABCDEF');
  });

  it('preserves the six-character codes produced by the server',()=>{
    expect(normalizeRoomCode('KID7XQ')).toBe('KID7XQ');
  });
});


describe('separate multiplayer origin',()=>{
  it('sends room requests and secure sockets to the same configured backend',()=>{
    expect(multiplayerEndpoint('/api/rooms','https://tank-game-server.fahru.me')).toBe('https://tank-game-server.fahru.me/api/rooms');
    expect(multiplayerEndpoint('/multiplayer/ABC123','https://tank-game-server.fahru.me',true)).toBe('wss://tank-game-server.fahru.me/multiplayer/ABC123');
  });
  it('supports local HTTP development and ignores paths on a configured origin',()=>{
    expect(multiplayerEndpoint('/multiplayer/ABC123','http://localhost:8787/',true)).toBe('ws://localhost:8787/multiplayer/ABC123');
    expect(multiplayerEndpoint('/api/rooms','https://example.com/old/path')).toBe('https://example.com/api/rooms');
  });
});
