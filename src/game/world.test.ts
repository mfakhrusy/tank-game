import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, MAX_CAMERA_ZOOM, MIN_CAMERA_ZOOM, chunkAt, chunkWindow, createChunkRandom, normalizeCameraZoom, rectangularChunkWindow } from './world';

describe('endless world streaming', () => {
  it('crosses chunks correctly in every direction', () => {
    expect(chunkAt(0, 0).key).toBe('0,0');
    expect(chunkAt(CHUNK_SIZE + 1, 0).key).toBe('1,0');
    expect(chunkAt(-1, -1).key).toBe('-1,-1');
    expect(chunkAt(-CHUNK_SIZE - 1, 0).key).toBe('-2,0');
  });

  it('keeps a bounded 5 by 5 window around the player', () => {
    const chunks = chunkWindow(12, -8);
    expect(chunks).toHaveLength(25);
    expect(chunks.some(chunk => chunk.key === '12,-8')).toBe(true);
    expect(chunks.some(chunk => chunk.key === '10,-10')).toBe(true);
    expect(chunks.some(chunk => chunk.key === '14,-6')).toBe(true);
  });

  it('supports rectangular camera windows without simulating unseen rows',()=>{
    const chunks=rectangularChunkWindow(0,0,2,1);
    expect(chunks).toHaveLength(15);
    expect(chunks.some(chunk=>chunk.key==='2,1')).toBe(true);
    expect(chunks.some(chunk=>chunk.key==='0,2')).toBe(false);
  });

  it('regenerates identical scenery when revisiting a chunk', () => {
    const first = createChunkRandom(-4, 9);
    const second = createChunkRandom(-4, 9);
    expect(Array.from({ length: 12 }, first)).toEqual(Array.from({ length: 12 }, second));
    const other = createChunkRandom(-3, 9);
    expect(Array.from({ length: 4 }, other)).not.toEqual(Array.from({ length: 4 }, createChunkRandom(-4, 9)));
  });

  it('keeps camera zoom inside the playable range',()=>{
    expect(normalizeCameraZoom(.1)).toBe(MIN_CAMERA_ZOOM);
    expect(normalizeCameraZoom(2)).toBe(MAX_CAMERA_ZOOM);
    expect(normalizeCameraZoom(.849)).toBe(.85);
  });

});
