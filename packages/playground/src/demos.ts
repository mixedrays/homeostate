import { Atom, Box, Layers, type LucideIcon } from 'lucide-react';

export type DemoId = 'zustand' | 'mobx' | 'redux';
export type DemoAccent = 'blue' | 'violet' | 'emerald';

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
};

export const demoList: readonly DemoMeta[] = [demos.zustand, demos.mobx, demos.redux];

export const accentClass: Record<DemoAccent, string> = {
  blue: 'theme-blue',
  violet: 'theme-violet',
  emerald: 'theme-emerald',
};
