import { mobx } from './mobx.js';
import { mobxStateTree } from './mobx-state-tree.js';
import { redux } from './redux.js';
import { zustand } from './zustand.js';
import type { Fixture } from '../types.js';

export { mobx, mobxStateTree, redux, zustand };

/** Every adapter the render benchmark covers, in the order the report lists them. */
export const fixtures: Fixture[] = [redux, zustand, mobxStateTree, mobx];
