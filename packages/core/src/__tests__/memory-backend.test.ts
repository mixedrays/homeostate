import { describe, expect, it, vi } from 'vitest';
import { createMemoryBackend } from '../index.js';

describe('createMemoryBackend', () => {
  it('starts as an empty object by default', () => {
    expect(createMemoryBackend().read()).toEqual({});
  });

  it('copies the initial value instead of aliasing it', () => {
    const initial = { list: [1] };
    const backend = createMemoryBackend(initial);

    initial.list.push(2);

    expect(backend.read()).toEqual({ list: [1] });
  });

  it('returns a fresh copy on every read', () => {
    const backend = createMemoryBackend({ list: [1] });

    const first = backend.read() as { list: number[] };
    first.list.push(2);

    expect(backend.read()).toEqual({ list: [1] });
    expect(backend.read()).not.toBe(backend.read());
  });

  it('replaces the whole state on write, copying it and dropping functions', () => {
    const backend = createMemoryBackend({ a: 1, b: 2 });
    const next = { b: 3, nested: { c: [1] }, fn: () => {} };

    backend.write(next);
    next.nested.c.push(2);

    expect(backend.read()).toEqual({ b: 3, nested: { c: [1] } });
  });

  it('does not notify subscribers about its own writes', () => {
    const backend = createMemoryBackend();
    const onRemoteChange = vi.fn();
    backend.subscribe(onRemoteChange);

    backend.write({ a: 1 });

    expect(onRemoteChange).not.toHaveBeenCalled();
  });

  it('notifies every subscriber once per receive and stores a copy', () => {
    const backend = createMemoryBackend();
    const first = vi.fn();
    const second = vi.fn();
    backend.subscribe(first);
    backend.subscribe(second);
    const remote = { a: [1] };

    backend.receive(remote);
    remote.a.push(2);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(backend.read()).toEqual({ a: [1] });
  });

  it('stops notifying after unsubscribe', () => {
    const backend = createMemoryBackend();
    const onRemoteChange = vi.fn();
    const unsubscribe = backend.subscribe(onRemoteChange);

    unsubscribe();
    backend.receive({ a: 1 });

    expect(onRemoteChange).not.toHaveBeenCalled();
    expect(backend.read()).toEqual({ a: 1 });
  });
});
