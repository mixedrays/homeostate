import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import type { RenderMeta } from './types.js';

const git = (args: string): string | null => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

const version = (name: string): string | null => {
  try {
    const require = createRequire(import.meta.url);
    const { version: found } = require(`${name}/package.json`) as { version?: string };
    return found ?? null;
  } catch {
    return null;
  }
};

/** What has to be recorded next to the numbers for them to mean anything later. */
export const collectMeta = (): RenderMeta => {
  const status = git('status --porcelain');
  const versions: Record<string, string> = {};
  const named = [
    'react',
    'react-dom',
    'mobx',
    'mobx-react-lite',
    'mobx-state-tree',
    '@reduxjs/toolkit',
    'react-redux',
    'zustand',
    'yjs',
  ];
  for (const name of named) {
    const found = version(name);
    if (found !== null) versions[name] = found;
  }

  return {
    date: new Date().toISOString(),
    node: process.version,
    commit: git('rev-parse --short HEAD'),
    dirty: status === null ? null : status.length > 0,
    versions,
  };
};
