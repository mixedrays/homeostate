import { Atom, Box, Layers, Orbit, Package, TreePine, Waves, type LucideIcon } from 'lucide-react';

export type DemoId =
  | 'zustand'
  | 'mobx'
  | 'redux'
  | 'jotai'
  | 'valtio'
  | 'tanstack-store'
  | 'mobx-state-tree';
export type DemoAccent = 'blue' | 'violet' | 'emerald' | 'cyan' | 'rose' | 'orange' | 'fuchsia';

export interface DemoMeta {
  id: DemoId;
  path: string;
  name: string;
  title: string;
  description: string;
  adapter: string;
  accent: DemoAccent;
  icon: LucideIcon;
}

export const demos: Record<DemoId, DemoMeta> = {
  zustand: {
    id: 'zustand',
    path: '/zustand',
    name: 'Zustand',
    title: 'Zustand Todo',
    description: 'A hook-based store kept in sync through createZustandAdapter.',
    adapter: '@homeostate/adapter-zustand',
    accent: 'blue',
    icon: Box,
  },
  mobx: {
    id: 'mobx',
    path: '/mobx',
    name: 'MobX',
    title: 'MobX Todo',
    description: 'An observable class store kept in sync through createMobxAdapter.',
    adapter: '@homeostate/adapter-mobx',
    accent: 'violet',
    icon: Atom,
  },
  redux: {
    id: 'redux',
    path: '/redux',
    name: 'Redux',
    title: 'Redux Todo',
    description: 'A Redux Toolkit slice kept in sync through createReduxAdapter.',
    adapter: '@homeostate/adapter-redux',
    accent: 'emerald',
    icon: Layers,
  },
  jotai: {
    id: 'jotai',
    path: '/jotai',
    name: 'Jotai',
    title: 'Jotai Todo',
    description: 'Atoms composed into one writable root atom kept in sync through createJotaiAdapter.',
    adapter: '@homeostate/adapter-jotai',
    accent: 'cyan',
    icon: Orbit,
  },
  valtio: {
    id: 'valtio',
    path: '/valtio',
    name: 'Valtio',
    title: 'Valtio Todo',
    description: 'A mutable proxy state kept in sync through createValtioAdapter.',
    adapter: '@homeostate/adapter-valtio',
    accent: 'rose',
    icon: Waves,
  },
  'tanstack-store': {
    id: 'tanstack-store',
    path: '/tanstack-store',
    name: 'TanStack Store',
    title: 'TanStack Store Todo',
    description: 'A Store with an actions factory kept in sync through createTanStackStoreAdapter.',
    adapter: '@homeostate/adapter-tanstack-store',
    accent: 'orange',
    icon: Package,
  },
  'mobx-state-tree': {
    id: 'mobx-state-tree',
    path: '/mobx-state-tree',
    name: 'MobX-State-Tree',
    title: 'MobX-State-Tree Todo',
    description: 'A typed model tree kept in sync through its snapshots with createMobxStateTreeAdapter.',
    adapter: '@homeostate/adapter-mobx-state-tree',
    accent: 'fuchsia',
    icon: TreePine,
  },
};

export const demoList: readonly DemoMeta[] = [
  demos.zustand,
  demos.mobx,
  demos.redux,
  demos.jotai,
  demos.valtio,
  demos['tanstack-store'],
  demos['mobx-state-tree'],
];

export const accentClass: Record<DemoAccent, string> = {
  blue: 'theme-blue',
  violet: 'theme-violet',
  emerald: 'theme-emerald',
  cyan: 'theme-cyan',
  rose: 'theme-rose',
  orange: 'theme-orange',
  fuchsia: 'theme-fuchsia',
};
