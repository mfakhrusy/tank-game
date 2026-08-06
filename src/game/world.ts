export const WORLD_LIMIT = 1_000_000;
export const CHUNK_SIZE = 720;
export const CHUNK_RADIUS = 2;
export const BLOCKS_PER_CHUNK = 6;
export const MIN_CAMERA_ZOOM = .55;
export const MAX_CAMERA_ZOOM = 1.15;

export function normalizeCameraZoom(value: number): number {
  return Math.round(Math.max(MIN_CAMERA_ZOOM,Math.min(MAX_CAMERA_ZOOM,value))*100)/100;
}

export type ChunkCoordinate = { x: number; y: number; key: string };

export function chunkAt(worldX: number, worldY: number): ChunkCoordinate {
  const x = Math.floor(worldX / CHUNK_SIZE);
  const y = Math.floor(worldY / CHUNK_SIZE);
  return { x, y, key: `${x},${y}` };
}

export function chunkWindow(centerX: number, centerY: number, radius = CHUNK_RADIUS): ChunkCoordinate[] {
  const chunks: ChunkCoordinate[] = [];
  for (let y = centerY - radius; y <= centerY + radius; y++) {
    for (let x = centerX - radius; x <= centerX + radius; x++) chunks.push({ x, y, key: `${x},${y}` });
  }
  return chunks;
}

export function rectangularChunkWindow(centerX:number,centerY:number,radiusX:number,radiusY:number):ChunkCoordinate[]{
  const chunks:ChunkCoordinate[]=[];
  for(let y=centerY-Math.max(0,radiusY);y<=centerY+Math.max(0,radiusY);y++)for(let x=centerX-Math.max(0,radiusX);x<=centerX+Math.max(0,radiusX);x++)chunks.push({x,y,key:`${x},${y}`});
  return chunks;
}

export function createChunkRandom(chunkX: number, chunkY: number): () => number {
  let seed = (Math.imul(chunkX, 73856093) ^ Math.imul(chunkY, 19349663) ^ 0x9e3779b9) >>> 0;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
