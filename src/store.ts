import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_BUILD, TankBuild, canAttach, getPart, randomBuild } from './game/config';

type Mode = 'workshop' | 'yard';
type Metrics = { blocks: number; shots: number; hits: number };
type GameStore = {
  build: TankBuild;
  mode: Mode;
  metrics: Metrics;
  attach: (partId: string) => boolean;
  setColor: (color: string) => void;
  randomize: () => void;
  setMode: (mode: Mode) => void;
  resetMetrics: () => void;
  recordShot: () => void;
  recordHit: () => void;
  recordBlock: () => void;
};

export const useGameStore = create<GameStore>()(persist((set, get) => ({
  build: DEFAULT_BUILD,
  mode: 'workshop',
  metrics: { blocks: 0, shots: 0, hits: 0 },
  attach: (partId) => {
    const build = get().build;
    if (!canAttach(build, partId)) return false;
    const part = getPart(partId);
    set({ build: { ...build, [part.slot]: part.id } });
    return true;
  },
  setColor: (color) => set({ build: { ...get().build, color } }),
  randomize: () => set({ build: randomBuild() }),
  setMode: (mode) => set({ mode }),
  resetMetrics: () => set({ metrics: { blocks: 0, shots: 0, hits: 0 } }),
  recordShot: () => set(({ metrics }) => ({ metrics: { ...metrics, shots: metrics.shots + 1 } })),
  recordHit: () => set(({ metrics }) => ({ metrics: { ...metrics, hits: metrics.hits + 1 } })),
  recordBlock: () => set(({ metrics }) => ({ metrics: { ...metrics, blocks: metrics.blocks + 1 } })),
}), { name: 'snap-tank-build', partialize: (state) => ({ build: state.build }) }));
