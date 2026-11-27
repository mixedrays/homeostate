/// <reference types="vite/client" />
import css from "./styles.css?inline";

const PROPERTY_RULE = /@property\s+[\w-]+\s*\{[^}]*\}/g;

/** The compiled devtools stylesheet, for the shadow root. */
export const devtoolsCss: string = css;

/**
 * Tailwind's `@property` registrations, for the document: browsers ignore them in a shadow root,
 * leaving shadows and transforms without initial values. A page on Tailwind 4 registers the same.
 */
export const devtoolsPropertiesCss: string = (
  css.match(PROPERTY_RULE) ?? []
).join("\n");
