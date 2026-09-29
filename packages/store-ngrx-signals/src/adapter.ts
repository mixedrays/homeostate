import { untracked, type Injector } from "@angular/core";
import { getState, watchState, type StateSource } from "@ngrx/signals";
import type { StoreAdapter } from "@homeostate/core";

export interface NgrxSignalsAdapterOptions<
  State extends object,
  Shared extends object,
> {
  /** Select an immutable, plain-JSON object from the store. */
  select: (state: State) => Shared;
  /** Replace the selected object, including removal of keys absent from next. */
  replace: (next: Shared) => void;
  /** Owns the synchronous watcher; also permits reconnecting outside DI context. */
  injector: Injector;
}

/** Bridge SignalStore or SignalState through a replaceable state slice. */
export function createNgrxSignalsAdapter<
  State extends object,
  Shared extends object,
>(
  store: StateSource<State>,
  options: NgrxSignalsAdapterOptions<State, Shared>,
): StoreAdapter<Shared> {
  const read = () => untracked(() => options.select(getState(store)));

  return {
    getState: read,
    setState: options.replace,
    subscribe: (onChange) => {
      let previous = read();
      const watcher = watchState(
        store,
        (state) => {
          const next = options.select(state);
          // watchState fires immediately. Subscription must not seed the backend,
          // particularly when the engine uses seed: 'never'.
          if (Object.is(previous, next)) return;
          previous = next;
          onChange();
        },
        { injector: options.injector },
      );
      return () => watcher.destroy();
    },
  };
}
