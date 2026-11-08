import { Progression, UpgradeId, freshProgression, buyUpgrade } from './game/progression';
import { create } from 'zustand';
import { copyBuild } from './buildLibrary';
import { persist } from 'zustand/middleware';
import { DEFAULT_BUILD, MountIndex, TankBuild, attachPart, migrateBuild, randomBuild, removeAttachment, replaceAttachment } from './game/config';
import { repairedHealth } from './game/combat';
import { normalizeCameraZoom } from './game/world';

type Metrics = { blocks: number; shots: number; hits: number };
type GameStore = {
  progression:Progression;
  resetProgression:()=>void;
  awardXp:(amount:number)=>void;
  upgrade:(id:UpgradeId)=>void;
  setProgression:(progression:Progression)=>void;
  build: TankBuild;
  loadBuild: (build:TankBuild) => void;
  mode: 'workshop' | 'yard';
  metrics: Metrics;
  position: { x: number; y: number };
  health: number;
  maxHealth: number;
  cameraZoom: number;
  autoSpin: boolean;
  autoShoot: boolean;
  toggleAutoSpin: () => void;
  toggleAutoShoot: () => void;
  attach: (partId: string, mount: MountIndex) => boolean;
  remove: (uid: string) => void;
  replace: (uid: string, partId: string) => void;
  setColor: (color: string) => void;
  setName: (name: string) => void;
  clear: () => void;
  randomize: () => void;
  setMode: (mode: 'workshop' | 'yard') => void;
  resetMetrics: () => void;
  recordCombat: (shots: number, hits: number) => void;
  recordBlock: () => void;
  recordPosition: (x: number, y: number) => void;
  resetHealth: (maximum: number) => void;
  damageHealth: (amount: number) => void;
  repairHealth: (amount: number) => void;
  setHealth: (health: number, maximum: number) => void;
  setCameraZoom: (zoom: number) => void;
};

export const useGameStore = create<GameStore>()(persist((set, get) => ({
  progression:freshProgression(),
  resetProgression:()=>set({progression:freshProgression()}),
  awardXp:(amount)=>set(state=>({progression:{...state.progression,xp:state.progression.xp+Math.max(0,amount)}})),
  upgrade:(id)=>set(state=>({progression:buyUpgrade(state.progression,id)})),
  setProgression:(progression)=>set(state=>JSON.stringify(state.progression)===JSON.stringify(progression)?{}:{progression}),
  build: DEFAULT_BUILD,
  loadBuild: (build) => set({build:copyBuild(build)}),
  mode: 'workshop',
  metrics: { blocks: 0, shots: 0, hits: 0 },
  position: { x: 0, y: 0 },
  health: 70,
  maxHealth: 70,
  cameraZoom: 1,
  autoSpin: false,
  autoShoot: false,
  toggleAutoSpin: () => set(state => ({ autoSpin: !state.autoSpin })),
  toggleAutoShoot: () => set(state => ({ autoShoot: !state.autoShoot })),
  attach: (partId, mount) => {
    const build = get().build;
    const next = attachPart(build, partId, mount);
    if (next === build) return false;
    set({ build: next });
    return true;
  },
  remove: (uid) => set({ build: removeAttachment(get().build, uid) }),
  replace: (uid, partId) => set({ build: replaceAttachment(get().build, uid, partId) }),
  setColor: (color) => set({ build: { ...get().build, color } }),
  setName: (name) => set({ build: { ...get().build, name: name.slice(0, 24) } }),
  clear: () => set({ build: { ...DEFAULT_BUILD, name: 'Blank Slate', attachments: [] } }),
  randomize: () => set({ build: randomBuild() }),
  setMode: (mode) => set({ mode }),
  resetMetrics: () => set({ metrics: { blocks: 0, shots: 0, hits: 0 }, position: { x: 0, y: 0 } }),
  recordCombat: (shots, hits) => { if(shots>0||hits>0)set(({ metrics }) => ({ metrics: { ...metrics, shots:metrics.shots+Math.max(0,shots), hits:metrics.hits+Math.max(0,hits) } })); },
  recordBlock: () => set(({ metrics }) => ({ metrics: { ...metrics, blocks: metrics.blocks + 1 } })),
  recordPosition: (x, y) => set({ position: { x, y } }),
  resetHealth: (maximum) => set({ health: maximum, maxHealth: maximum }),
  damageHealth: (amount) => set(({ health }) => ({ health: Math.max(0, health - Math.max(0, amount)) })),
  repairHealth: (amount) => set(({ health, maxHealth }) => ({ health: repairedHealth(health, maxHealth, amount) })),
  setHealth: (health, maximum) => set({ health:Math.max(0,Math.round(health)), maxHealth:Math.max(1,Math.round(maximum)) }),
  setCameraZoom: (cameraZoom) => set({ cameraZoom:normalizeCameraZoom(cameraZoom) }),
}), { name: 'snap-tank-build-v2', version: 2, partialize: (state) => ({ build: state.build }), merge: (persisted, current) => ({ ...current, ...(persisted as Partial<GameStore>), build: migrateBuild((persisted as Partial<GameStore>)?.build) }) }));
