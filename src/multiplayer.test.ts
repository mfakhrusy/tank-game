import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMultiplayerRoom, multiplayerEndpoint, normalizeRoomCode } from './multiplayer';

describe('multiplayer room codes', () => {
  it('makes pasted codes safe and consistent', () => {
    expect(normalizeRoomCode(' ab-c 12! ')).toBe('ABC12');
    expect(normalizeRoomCode('abcdefgh')).toBe('ABCDEF');
  });

  it('preserves the six-character codes produced by the server', () => {
    expect(normalizeRoomCode('KID7XQ')).toBe('KID7XQ');
  });
});

describe('separate multiplayer origin', () => {
  it('sends room requests and secure sockets to the same configured backend', () => {
    expect(multiplayerEndpoint('/api/rooms', 'https://tank-game-server.fahru.me')).toBe(
      'https://tank-game-server.fahru.me/api/rooms',
    );
    expect(
      multiplayerEndpoint('/multiplayer/ABC123', 'https://tank-game-server.fahru.me', true),
    ).toBe('wss://tank-game-server.fahru.me/multiplayer/ABC123');
  });
  it('supports local HTTP development and ignores paths on a configured origin', () => {
    expect(multiplayerEndpoint('/multiplayer/ABC123', 'http://localhost:8787/', true)).toBe(
      'ws://localhost:8787/multiplayer/ABC123',
    );
    expect(multiplayerEndpoint('/api/rooms', 'https://example.com/old/path')).toBe(
      'https://example.com/api/rooms',
    );
  });
});

describe('room creation errors', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('explains the room limit to players', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ code: 'room_limit_reached' }), { status: 503 }),
        ),
    );
    await expect(createMultiplayerRoom()).rejects.toThrow(
      'The server is full (10 rooms maximum). Join an existing room or try again later.',
    );
  });
  it('keeps the connection error for other server failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 })));
    await expect(createMultiplayerRoom()).rejects.toThrow('Is the multiplayer server running?');
  });
});
