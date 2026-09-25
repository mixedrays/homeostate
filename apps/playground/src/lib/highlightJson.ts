import {
  createHighlighterCoreSync,
  type HighlighterCore,
  type ThemedToken,
  type ThemeRegistrationRaw,
} from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import json from 'shiki/langs/json.mjs';

const THEME_NAME = 'homeostate-light';

const theme: ThemeRegistrationRaw = {
  name: THEME_NAME,
  type: 'light',
  colors: { 'editor.background': '#ffffff', 'editor.foreground': '#334155' },
  settings: [
    { settings: { foreground: '#334155' } },
    { scope: 'punctuation', settings: { foreground: '#94a3b8' } },
    {
      scope: ['support.type.property-name', 'punctuation.support.type.property-name'],
      settings: { foreground: '#1d4ed8' },
    },
    { scope: ['string', 'punctuation.definition.string'], settings: { foreground: '#047857' } },
    { scope: 'constant.numeric', settings: { foreground: '#b45309' } },
    { scope: 'constant.language', settings: { foreground: '#be123c' } },
  ],
};

let highlighter: HighlighterCore | undefined;

const getHighlighter = (): HighlighterCore =>
  (highlighter ??= createHighlighterCoreSync({
    themes: [theme],
    langs: [json],
    engine: createJavaScriptRegexEngine(),
  }));

export type JsonLine = readonly ThemedToken[];

export const tokenizeJson = (code: string): JsonLine[] =>
  getHighlighter().codeToTokensBase(code, { lang: 'json', theme: THEME_NAME });
