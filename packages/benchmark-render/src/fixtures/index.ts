import { mobx } from './mobx.js';
import { redux } from './redux.js';
import type { Fixture } from '../types.js';

export { mobx, redux };

/** Every adapter the render benchmark covers, in the order the report lists them. */
export const fixtures: Fixture[] = [redux, mobx];
