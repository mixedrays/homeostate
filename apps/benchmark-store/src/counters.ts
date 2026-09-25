import type { Counters } from './types.js';

export const createCounters = (): Counters => ({
  app: 0,
  searchBox: 0,
  list: 0,
  row: 0,
  footer: 0,
});

export const resetCounters = (counters: Counters): void => {
  counters.app = 0;
  counters.searchBox = 0;
  counters.list = 0;
  counters.row = 0;
  counters.footer = 0;
};
